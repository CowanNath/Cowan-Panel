// Package probe 实现单个站点的在线探测。
// 探测采用「按需触发」：首页右下角的探测按钮调用 POST /api/probe/all，
// 后端并发调用 Check 并写回状态，不再有后台定时器。
package probe

import (
	"context"
	"net"
	"net/http"
	"net/url"
	"time"
)

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
