// Package model 定义数据库模型。
package model

import "time"

// Group 分组
type Group struct {
	ID        uint      `json:"id" gorm:"primaryKey"`
	Name      string    `json:"name"`
	Sort      int       `json:"sort"`
	LAN       bool      `json:"lan"` // 内网分组：探测时强制直连，不走代理
	CreatedAt time.Time `json:"createdAt"`
}

// Item 书签卡片
type Item struct {
	ID                  uint       `json:"id" gorm:"primaryKey"`
	GroupID             uint       `json:"groupId" gorm:"index"`
	Name                string     `json:"name"`
	URL                 string     `json:"url"`
	IconURL             string     `json:"iconUrl"`
	Description         string     `json:"description"`
	Sort                int        `json:"sort"`
	CardBackgroundColor string     `json:"cardBackgroundColor"`
	OpenInNewTab        bool       `json:"openInNewTab"`
	CheckEnabled        bool       `json:"checkEnabled"`
	LastStatus          string     `json:"lastStatus"` // up | down | unknown
	LastCheckedAt       *time.Time `json:"lastCheckedAt"`
}

// Setting 键值配置
type Setting struct {
	Key   string `json:"key" gorm:"primaryKey"`
	Value string `json:"value"`
}
