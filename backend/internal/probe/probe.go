// Package probe 实现站点在线探测：定时并发探测 CheckEnabled 的 item 并更新状态。
package probe

import (
	"context"
	"log"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"sync"
	"time"

	"golang.org/x/sync/errgroup"

	"cowan-panel/backend/internal/model"
	"cowan-panel/backend/internal/service"
)

// Scheduler 定时探测调度器
type Scheduler struct {
	stop chan struct{}
	once sync.Once
}

// NewScheduler 创建调度器
func NewScheduler() *Scheduler {
	return &Scheduler{stop: make(chan struct{})}
}

// Start 启动定时探测循环。
func (s *Scheduler) Start() {
	go func() {
		for {
			s.RunOnce()
			select {
			case <-s.stop:
				return
			case <-time.After(readInterval()):
			}
		}
	}()
}

// Stop 停止调度器
func (s *Scheduler) Stop() {
	s.once.Do(func() { close(s.stop) })
}

// readInterval 从设置读取探测间隔（秒）。
func readInterval() time.Duration {
	sec := 60
	var st model.Setting
	if err := service.DB.Where("key = ?", "probeInterval").First(&st).Error; err == nil {
		if v, err := strconv.Atoi(st.Value); err == nil && v > 0 {
			sec = v
		}
	}
	return time.Duration(sec) * time.Second
}

// Enabled 读取探测开关（probeEnabled）。
func Enabled() bool {
	var st model.Setting
	if err := service.DB.Where("key = ?", "probeEnabled").First(&st).Error; err != nil {
		return false
	}
	return st.Value == "true" || st.Value == "1"
}

// RunOnce 对所有 CheckEnabled 的 item 并发探测（限并发 20），更新状态。
func (s *Scheduler) RunOnce() {
	if !Enabled() {
		return
	}
	var items []model.Item
	if err := service.DB.Where("check_enabled = ?", true).Find(&items).Error; err != nil {
		log.Println("[probe] 读取待探测项失败:", err)
		return
	}
	if len(items) == 0 {
		return
	}
	var wg errgroup.Group
	wg.SetLimit(20)
	for i := range items {
		it := items[i]
		wg.Go(func() error {
			status := Check(it.URL)
			now := time.Now()
			if err := service.DB.Model(&model.Item{}).Where("id = ?", it.ID).
				Updates(map[string]any{"last_status": status, "last_checked_at": &now}).Error; err != nil {
				log.Println("[probe] 更新状态失败 id =", it.ID, err)
			}
			return nil
		})
	}
	_ = wg.Wait()
}

// Check 探测单个 URL：先 TCP dial（3s 超时），失败再尝试 HTTP HEAD/GET。返回 "up"/"down"。
func Check(rawURL string) string {
	u, err := url.Parse(rawURL)
	if err != nil || u.Host == "" {
		return "down"
	}
	host := u.Host
	if _, _, err := net.SplitHostPort(host); err != nil {
		port := "80"
		if u.Scheme == "https" {
			port = "443"
		}
		host = net.JoinHostPort(host, port)
	}
	if conn, err := net.DialTimeout("tcp", host, 3*time.Second); err == nil {
		conn.Close()
		return "up"
	}
	return httpCheck(rawURL)
}

// httpCheck HTTP 探测（HEAD → GET 回退），3s 超时。
func httpCheck(rawURL string) string {
	client := &http.Client{Timeout: 3 * time.Second}
	for _, method := range []string{http.MethodHead, http.MethodGet} {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		req, err := http.NewRequestWithContext(ctx, method, rawURL, nil)
		if err != nil {
			cancel()
			return "down"
		}
		resp, err := client.Do(req)
		cancel()
		if err == nil {
			resp.Body.Close()
			return "up"
		}
	}
	return "down"
}
