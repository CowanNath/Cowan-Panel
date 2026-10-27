// Cowan-Panel 后端服务入口：初始化数据库、注册路由、内嵌前端、优雅退出。
package main

import (
	"context"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"

	"cowan-panel/backend/internal/handler"
	"cowan-panel/backend/internal/service"
	"cowan-panel/backend/web"
)

func main() {
	// 1) 初始化数据库与数据目录
	if err := service.Init(); err != nil {
		log.Fatal("[main] 初始化失败:", err)
	}

	port := "8100"
	if v := os.Getenv("COWAN_PORT"); v != "" {
		port = v
	}

	// 2) 路由
	gin.SetMode(gin.ReleaseMode)
	r := gin.Default()
	api := r.Group("/api")
	{
		api.GET("/groups", handler.ListGroups)
		api.POST("/groups", handler.CreateGroup)
		api.PUT("/groups/sort", handler.SortGroups) // 注意放在 :id 之前
		api.PUT("/groups/:id", handler.UpdateGroup)
		api.DELETE("/groups/:id", handler.DeleteGroup)

		api.GET("/items", handler.ListItems)
		api.POST("/items", handler.CreateItem)
		api.PUT("/items/sort", handler.SortItems)
		api.PUT("/items/:id", handler.UpdateItem)
		api.DELETE("/items/:id", handler.DeleteItem)
		api.POST("/items/check", handler.CheckItem)
		api.POST("/probe/all", handler.ProbeAll)

		api.GET("/status", handler.GetStatus)
		api.POST("/icons/upload", handler.UploadIcon)
		api.GET("/assets/*filepath", handler.GetAsset)
		api.POST("/favicon/fetch", handler.FetchFavicon)
		api.POST("/icons/backfill", handler.BackfillIcons)

		api.GET("/settings", handler.GetSettings)
		api.PUT("/settings", handler.PutSettings)
		api.GET("/overview", handler.Overview)

		api.POST("/import/sunpanel", handler.ImportSunPanel)
		api.GET("/export/sunpanel", handler.ExportSunPanel)
		api.GET("/export/full", handler.ExportFull)
		api.POST("/import/full", handler.ImportFull)
	}

	// 3) 内嵌前端静态服务 + SPA fallback
	dist, err := fs.Sub(web.Dist, "dist")
	if err != nil {
		log.Fatal("[main] 读取内嵌前端失败:", err)
	}
	fileServer := http.FileServer(http.FS(dist))
	r.NoRoute(func(c *gin.Context) {
		c.Header("Cache-Control", "no-store")
		p := strings.TrimPrefix(c.Request.URL.Path, "/")
		if p != "" {
			if f, err := fs.Stat(dist, p); err == nil && !f.IsDir() {
				// 带内容哈希的静态资源可长期缓存
				if strings.HasPrefix(p, "assets/") {
					c.Header("Cache-Control", "public, max-age=31536000, immutable")
				}
				fileServer.ServeHTTP(c.Writer, c.Request)
				return
			}
		}
		// SPA fallback 到 index.html
		data, err := fs.ReadFile(dist, "index.html")
		if err != nil {
			c.String(http.StatusNotFound, "frontend not embedded (dist missing)")
			return
		}
		c.Data(http.StatusOK, "text/html; charset=utf-8", data)
	})

	// 4) HTTP 服务 + 优雅退出（在线探测改为首页手动触发，不再有后台定时器）
	srv := &http.Server{Addr: ":" + port, Handler: r}
	go func() {
		log.Println("[main] Cowan-Panel 监听 :" + port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal("[main] HTTP 服务异常:", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("[main] 收到退出信号，正在关闭…")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Println("[main] 关闭异常:", err)
	}
	log.Println("[main] 已退出")
}
