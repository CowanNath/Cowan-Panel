// Package handler：状态探测、上传、favicon 抓取、设置、概览相关接口。
package handler

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gin-gonic/gin"

	"cowan-panel/backend/internal/model"
	"cowan-panel/backend/internal/probe"
	"cowan-panel/backend/internal/service"
)

// CheckItem POST /api/items/check  body: {id} 或 {url}
func CheckItem(c *gin.Context) {
	var body struct {
		ID  uint   `json:"id"`
		URL string `json:"url"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	target := body.URL
	if body.ID != 0 {
		var it model.Item
		if err := service.DB.First(&it, body.ID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "item not found"})
			return
		}
		target = it.URL
	}
	status := probe.Check(target, "")
	now := time.Now()
	if body.ID != 0 {
		service.DB.Model(&model.Item{}).Where("id = ?", body.ID).
			Updates(map[string]any{"last_status": status, "last_checked_at": &now})
	}
	c.JSON(http.StatusOK, gin.H{"status": status, "lastCheckedAt": now})
}

// GetStatus GET /api/status  返回全部启用探测的 item 状态
func GetStatus(c *gin.Context) {
	var its []model.Item
	if err := service.DB.Where("check_enabled = ?", true).
		Select("id", "url", "last_status", "last_checked_at").Find(&its).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, its)
}

// UploadIcon POST /api/icons/upload  multipart file
func UploadIcon(c *gin.Context) {
	fh, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file required"})
		return
	}
	// 扩展名（白名单校验，防任意文件写入）
	ext := strings.ToLower(filepath.Ext(fh.Filename))
	allowed := map[string]bool{".png": true, ".jpg": true, ".jpeg": true, ".gif": true,
		".webp": true, ".svg": true, ".ico": true, ".bmp": true}
	if ext == "" || !allowed[ext] {
		ext = ".png"
	}
	now := time.Now()
	relDir := filepath.Join("uploads", now.Format("06"), now.Format("01"))
	absDir := filepath.Join(service.DataDir, relDir)
	if err := os.MkdirAll(absDir, 0o755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	u := uuid()
	rel := filepath.ToSlash(filepath.Join(relDir, u+ext))
	if err := c.SaveUploadedFile(fh, filepath.Join(service.DataDir, rel)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"url": "/api/assets/" + rel})
}

// GetAsset GET /api/assets/*filepath  静态服务 data/uploads
func GetAsset(c *gin.Context) {
	p := c.Param("filepath")
	// 用 path 处理 URL 路径（filepath 在 Windows 上会把 / 转成 \）
	clean := path.Clean("/" + p)
	// 兼容两种 URL 形式：/api/assets/26/10/x.png 与 /api/assets/uploads/26/10/x.png
	clean = strings.TrimPrefix(clean, "/uploads")
	rel := strings.TrimPrefix(clean, "/")
	baseDir := filepath.Join(service.DataDir, "uploads")
	abs := filepath.Join(baseDir, filepath.FromSlash(rel))
	// 防目录穿越
	if rp, err := filepath.Rel(baseDir, abs); err != nil || strings.HasPrefix(rp, "..") {
		c.Status(http.StatusNotFound)
		return
	}
	c.File(abs)
}

// FetchFavicon POST /api/favicon/fetch  body: {url}
// 抓目标站点图标并落盘，返回 {iconUrl}
func FetchFavicon(c *gin.Context) {
	var body struct {
		URL string `json:"url"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.URL == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "url required"})
		return
	}
	iconURL, err := fetchAndStoreIcon(body.URL)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "favicon fetch failed: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"iconUrl": iconURL})
}

// looksLikeImage 判断响应内容是否为图片（含 SVG 文本）
func looksLikeImage(b []byte) bool {
	if len(b) == 0 {
		return false
	}
	sample := b
	if len(sample) > 512 {
		sample = sample[:512]
	}
	if strings.HasPrefix(http.DetectContentType(sample), "image/") {
		return true
	}
	return strings.Contains(strings.ToLower(string(sample)), "<svg")
}

// proxyURL 返回图标抓取使用的 HTTP 代理：优先设置项 proxy，其次环境变量 COWAN_PROXY
func proxyURL() string {
	var st model.Setting
	if err := service.DB.First(&st, "key = ?", "proxy").Error; err == nil {
		if v := strings.TrimSpace(st.Value); v != "" {
			return v
		}
	}
	return strings.TrimSpace(os.Getenv("COWAN_PROXY"))
}

// fetchAndStoreIcon 抓取站点图标：/favicon.ico → 首页 link icon → 第三方服务兜底；存 uploads 后返回访问地址
func fetchAndStoreIcon(rawURL string) (string, error) {
	u, err := url.Parse(rawURL)
	if err != nil || u.Host == "" {
		return "", fmt.Errorf("invalid url")
	}
	base := u.Scheme + "://" + u.Host
	// 单个站点整体超时上限，避免多个兜底串行拖太久
	ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
	defer cancel()
	// 支持通过设置项或环境变量指定 HTTP 代理（例如 Clash: http://127.0.0.1:7890）
	transport := http.DefaultTransport.(*http.Transport).Clone()
	if proxyAddr := proxyURL(); proxyAddr != "" {
		if pu, err := url.Parse(proxyAddr); err == nil && pu.Host != "" {
			transport.Proxy = http.ProxyURL(pu)
		}
	}
	client := &http.Client{Timeout: 6 * time.Second, Transport: transport}

	get := func(raw string) ([]byte, error) {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, raw, nil)
		if err != nil {
			return nil, err
		}
		// 部分站点会拒绝无 UA 的请求
		req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36")
		resp, err := client.Do(req)
		if err != nil {
			return nil, err
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("status %d", resp.StatusCode)
		}
		return io.ReadAll(io.LimitReader(resp.Body, 2<<20)) // 最多 2MB
	}

	// iconGet 在 get 基础上校验内容确实是图片（很多站点对错误路径返回 200 + HTML）
	iconGet := func(raw string) ([]byte, error) {
		d, err := get(raw)
		if err != nil {
			return nil, err
		}
		if !looksLikeImage(d) {
			return nil, fmt.Errorf("not an image")
		}
		return d, nil
	}

	// 依次尝试：/favicon.ico → 首页 HTML 的 link icon → 第三方服务兜底
	var data []byte
	srcURL := base + "/favicon.ico"
	var lastErr error
	if d, err := iconGet(srcURL); err == nil && len(d) > 0 {
		data = d
	} else {
		lastErr = err
		var iconURL string
		if page, err := get(base + "/"); err == nil {
			html := string(page)
			if m := linkIconRe.FindStringSubmatch(html); m != nil {
				ref := strings.TrimSpace(m[1])
				if ref != "" {
					iconURL = ref
					if !strings.Contains(ref, "://") {
						iconURL = base + ref
					}
				}
			}
		}
		if iconURL != "" {
			if d, err := iconGet(iconURL); err == nil && len(d) > 0 {
				data = d
				srcURL = iconURL
			} else {
				lastErr = err
			}
		}
		if data == nil {
			// 第三方 favicon 服务兜底（favicon.im 国内可访问；google 最后尝试）
			fallbacks := []string{
				"https://favicon.im/" + u.Hostname() + "?larger=true",
				"https://api.iowen.cn/favicon/" + u.Hostname() + ".png",
			}
			for _, fb := range fallbacks {
				if d, err := iconGet(fb); err == nil && len(d) > 0 {
					data = d
					srcURL = fb
					break
				} else if err != nil {
					lastErr = err
				}
			}
		}
	}
	if data == nil {
		if lastErr == nil {
			lastErr = fmt.Errorf("no icon found")
		}
		return "", lastErr
	}
	// 保存
	now := time.Now()
	relDir := filepath.Join("uploads", now.Format("06"), now.Format("01"))
	if err := os.MkdirAll(filepath.Join(service.DataDir, relDir), 0o755); err != nil {
		return "", err
	}
	ext := ".ico"
	switch {
	case strings.Contains(srcURL, ".png"):
		ext = ".png"
	case strings.Contains(srcURL, ".svg"):
		ext = ".svg"
	case strings.Contains(srcURL, ".gif"):
		ext = ".gif"
	}
	rel := filepath.ToSlash(filepath.Join(relDir, uuid()+ext))
	if err := os.WriteFile(filepath.Join(service.DataDir, rel), data, 0o644); err != nil {
		return "", err
	}
	return "/api/assets/" + rel, nil
}

// backfillRunning 防止重复启动图标补全任务
var backfillRunning atomic.Bool

// BackfillIcons POST /api/icons/backfill  后台补全所有缺失图标（异步）
func BackfillIcons(c *gin.Context) {
	started := startBackfill()
	c.JSON(http.StatusOK, gin.H{"started": started})
}

// startBackfill 启动后台补全任务；已在运行则返回 false
func startBackfill() bool {
	if !backfillRunning.CompareAndSwap(false, true) {
		return false
	}
	go func() {
		defer backfillRunning.Store(false)
		// 1) 清理本地已失效的图标（文件不存在或不是图片），外链图标不动
		var withIcons []model.Item
		service.DB.Where("icon_url <> ''").Find(&withIcons)
		for _, it := range withIcons {
			if strings.HasPrefix(it.IconURL, "http") {
				continue
			}
			rel := strings.TrimPrefix(it.IconURL, "/api/assets/")
			rel = strings.TrimPrefix(rel, "uploads/")
			abs := filepath.Join(service.DataDir, "uploads", filepath.FromSlash(rel))
			if b, err := os.ReadFile(abs); err != nil || !looksLikeImage(b) {
				service.DB.Model(&model.Item{}).Where("id = ?", it.ID).Update("icon_url", "")
			}
		}
		// 2) 为缺失图标的卡片抓取
		var items []model.Item
		if err := service.DB.Where("icon_url = '' OR icon_url IS NULL").Find(&items).Error; err != nil {
			log.Println("[backfill] 查询失败:", err)
			return
		}
		sem := make(chan struct{}, 12)
		var wg sync.WaitGroup
		for _, it := range items {
			if it.URL == "" {
				continue
			}
			wg.Add(1)
			sem <- struct{}{}
			go func(it model.Item) {
				defer wg.Done()
				defer func() { <-sem }()
				icon, err := fetchAndStoreIcon(it.URL)
				if err != nil {
					return
				}
				service.DB.Model(&model.Item{}).Where("id = ?", it.ID).Update("icon_url", icon)
			}(it)
		}
		wg.Wait()
		log.Printf("[backfill] 图标补全完成，共检查 %d 个卡片", len(items))
	}()
	return true
}

// linkIconRe 匹配 <link rel="...icon..."> 的 href
var linkIconRe = regexp.MustCompile(`(?is)<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]*href=["']([^"']+)["']`)

// settingsMap 读取全部设置并做类型化（布尔/数字按语义转换）
func settingsMap() (map[string]any, error) {
	var sts []model.Setting
	if err := service.DB.Find(&sts).Error; err != nil {
		return nil, err
	}
	out := map[string]any{}
	for _, s := range sts {
		switch s.Key {
		case "probeEnabled":
			if b, err := strconv.ParseBool(s.Value); err == nil {
				out[s.Key] = b
			} else {
				out[s.Key] = false
			}
		case "probeViaProxy":
			if b, err := strconv.ParseBool(s.Value); err == nil {
				out[s.Key] = b
			} else {
				out[s.Key] = false
			}
		case "probeInterval":
			if n, err := strconv.Atoi(s.Value); err == nil {
				out[s.Key] = n
			} else {
				out[s.Key] = 60
			}
		default:
			out[s.Key] = s.Value
		}
	}
	return out, nil
}

// GetSettings GET /api/settings
func GetSettings(c *gin.Context) {
	out, err := settingsMap()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, out)
}

// coerceString 把任意 JSON 标量转为存储用字符串
func coerceString(v any) string {
	switch t := v.(type) {
	case string:
		return t
	case bool:
		if t {
			return "true"
		}
		return "false"
	case float64:
		if t == math.Trunc(t) {
			return strconv.FormatInt(int64(t), 10)
		}
		return strconv.FormatFloat(t, 'f', -1, 64)
	default:
		return fmt.Sprint(v)
	}
}

// PutSettings PUT /api/settings  body: 任意 KV JSON 对象（值可为字符串/布尔/数字）
func PutSettings(c *gin.Context) {
	var m map[string]any
	if err := c.ShouldBindJSON(&m); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	for k, v := range m {
		st := model.Setting{Key: k, Value: coerceString(v)}
		if err := service.DB.Save(&st).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// Overview GET /api/overview  首页一次性数据：groups(含 items) + settings
func Overview(c *gin.Context) {
	var gs []model.Group
	if err := service.DB.Order("sort asc, id asc").Find(&gs).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	var its []model.Item
	if err := service.DB.Order("sort asc, id asc").Find(&its).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	byGroup := map[uint][]model.Item{}
	for _, it := range its {
		byGroup[it.GroupID] = append(byGroup[it.GroupID], it)
	}
	type groupWithItems struct {
		model.Group
		Items []model.Item `json:"items"`
	}
	out := make([]groupWithItems, 0, len(gs))
	for _, g := range gs {
		items := byGroup[g.ID]
		if items == nil {
			items = []model.Item{}
		}
		out = append(out, groupWithItems{Group: g, Items: items})
	}
	sm, err := settingsMap()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"groups": out, "settings": sm})
}

// ImportSunPanel POST /api/import/sunpanel?mode=overwrite|append  body: 原始 JSON
func ImportSunPanel(c *gin.Context) {
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	mode := c.DefaultQuery("mode", "overwrite")
	if mode != "overwrite" && mode != "append" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "mode must be overwrite or append"})
		return
	}
	g, i, err := service.ImportSunPanel(body, mode)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	// 导入后自动在后台补全缺失图标（sun-panel 导出不含图标文件）
	startBackfill()
	c.JSON(http.StatusOK, gin.H{"groups": g, "items": i})
}

// ExportSunPanel GET /api/export/sunpanel
func ExportSunPanel(c *gin.Context) {
	data, err := service.ExportSunPanel()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Header("Content-Disposition", `attachment; filename="sunpanel-export.json"`)
	c.Data(http.StatusOK, "application/json", data)
}

// ExportFull GET /api/export/full
func ExportFull(c *gin.Context) {
	data, err := service.ExportFull()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Header("Content-Disposition", `attachment; filename="cowan-full-backup.json"`)
	c.Data(http.StatusOK, "application/json", data)
}

// ImportFull POST /api/import/full
func ImportFull(c *gin.Context) {
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := service.ImportFull(body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// uuid 生成 32 位十六进制随机串
func uuid() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return fmt.Sprintf("%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(b)
}
