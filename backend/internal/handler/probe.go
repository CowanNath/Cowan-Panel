// Package handler：一键探测接口（手动触发，全量并发探测所有卡片）。
package handler

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/sync/errgroup"

	"cowan-panel/backend/internal/model"
	"cowan-panel/backend/internal/probe"
	"cowan-panel/backend/internal/service"
)

// probeViaProxyEnabled 读取设置项 probeViaProxy
func probeViaProxyEnabled() bool {
	var st model.Setting
	if err := service.DB.Where("key = ?", "probeViaProxy").First(&st).Error; err != nil {
		return false
	}
	b, err := strconv.ParseBool(st.Value)
	return err == nil && b
}

// ProbeAll POST /api/probe/all
// 对全部卡片做一次并发探测（限并发 20），写入状态并返回结果。
// 外网分组在 probeViaProxy 开启时走代理，内网分组（Group.LAN）始终直连。
func ProbeAll(c *gin.Context) {
	var items []model.Item
	if err := service.DB.Select("id", "url", "group_id").Find(&items).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// 分组的内网标记
	var groups []model.Group
	service.DB.Select("id", "lan").Find(&groups)
	lanGroup := make(map[uint]bool, len(groups))
	for _, g := range groups {
		lanGroup[g.ID] = g.LAN
	}

	useProxy := probeViaProxyEnabled()
	proxyAddr := ""
	if useProxy {
		proxyAddr = proxyURL()
	}

	type result struct {
		ID            uint      `json:"id"`
		LastStatus    string    `json:"lastStatus"`
		LastCheckedAt time.Time `json:"lastCheckedAt"`
	}
	results := make([]result, len(items))
	var g errgroup.Group
	g.SetLimit(20)
	for i := range items {
		i := i
		g.Go(func() error {
			addr := ""
			if useProxy && !lanGroup[items[i].GroupID] {
				addr = proxyAddr
			}
			status := probe.Check(items[i].URL, addr)
			now := time.Now()
			service.DB.Model(&model.Item{}).Where("id = ?", items[i].ID).
				Updates(map[string]any{"last_status": status, "last_checked_at": &now})
			results[i] = result{ID: items[i].ID, LastStatus: status, LastCheckedAt: now}
			return nil
		})
	}
	_ = g.Wait()

	up := 0
	for _, r := range results {
		if r.LastStatus == "up" {
			up++
		}
	}
	c.JSON(http.StatusOK, gin.H{
		"total":      len(results),
		"up":         up,
		"down":       len(results) - up,
		"probeProxy": useProxy && proxyAddr != "",
		"items":      results,
	})
}
