// Package service 提供数据库初始化与业务逻辑。
package service

import (
	"os"
	"path/filepath"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"

	"cowan-panel/backend/internal/model"
)

// DB 全局数据库句柄
var DB *gorm.DB

// DataDir 数据目录（默认 ./data，可用 COWAN_DATA 覆盖）
var DataDir = "./data"

// Init 初始化数据目录与数据库，并在空库时写入默认设置。
func Init() error {
	if v := os.Getenv("COWAN_DATA"); v != "" {
		DataDir = v
	}
	if err := os.MkdirAll(filepath.Join(DataDir, "uploads"), 0o755); err != nil {
		return err
	}
	db, err := gorm.Open(sqlite.Open(filepath.Join(DataDir, "cowan.db")), &gorm.Config{})
	if err != nil {
		return err
	}
	DB = db
	if err := db.AutoMigrate(&model.Group{}, &model.Item{}, &model.Setting{}); err != nil {
		return err
	}
	return seedDefaults()
}

// seedDefaults 保证默认设置项存在（老版本升级后新增的键也会补上，不覆盖已有值）。
func seedDefaults() error {
	defaults := []model.Setting{
		{Key: "siteTitle", Value: "Cowan-Panel"},
		{Key: "theme", Value: "auto"},
		{Key: "wallpaper", Value: "/bg.jpg"}, // 内置默认壁纸（frontend/public/bg.jpg）
		{Key: "groupLayout", Value: "stack"},
		{Key: "proxy", Value: ""},
		{Key: "probeViaProxy", Value: "false"}, // 外网分组探测是否走代理（内网分组始终直连）
	}
	for _, st := range defaults {
		var cnt int64
		if err := DB.Model(&model.Setting{}).Where("key = ?", st.Key).Count(&cnt).Error; err != nil {
			return err
		}
		if cnt == 0 {
			if err := DB.Create(&st).Error; err != nil {
				return err
			}
		}
	}
	return nil
}
