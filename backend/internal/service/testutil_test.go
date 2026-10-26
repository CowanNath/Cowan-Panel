// 测试辅助：内存 SQLite。
package service

import (
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

// openMemory 打开内存数据库。
func openMemory() (*gorm.DB, error) {
	return gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
}
