// Package probe 实现单个站点的在线探测。
// 探测采用「按需触发」：首页右下角的探测按钮调用 POST /api/probe/all，
// 后端并发调用 Check 并写回状态，不再有后台定时器。
//
// 代理策略：外网分组可通过设置项 probeViaProxy 让探测走 HTTP 代理，
// 内网分组（Group.LAN）始终直连，避免局域网地址被代理误判。
package probe

import (
	"context"
	"net"
	"net/http"
	"net/url"
	"time"
)

// Check 探测单个 URL。proxyAddr 为空时直连；非空时通过该 HTTP 代理访问。
// 直连模式：先 TCP dial（3s），失败再 HTTP HEAD/GET（3s）。
// 代理模式：直接走 HTTP 代理（10s），不做 TCP 直连探测（避免无意义的 3s 等待）。
func Check(rawURL, proxyAddr string) string {
	if proxyAddr != "" {
		return httpCheck(rawURL, proxyAddr, 10*time.Second)
	}
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
	return httpCheck(rawURL, "", 3*time.Second)
}

// httpCheck HTTP 探测（HEAD → GET 回退）。
func httpCheck(rawURL, proxyAddr string, timeout time.Duration) string {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	if proxyAddr != "" {
		if pu, err := url.Parse(proxyAddr); err == nil && pu.Host != "" {
			transport.Proxy = http.ProxyURL(pu)
		}
	}
	client := &http.Client{Timeout: timeout, Transport: transport}
	for _, method := range []string{http.MethodHead, http.MethodGet} {
		ctx, cancel := context.WithTimeout(context.Background(), timeout)
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
