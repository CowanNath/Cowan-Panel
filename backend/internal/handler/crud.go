// Package handler 提供 REST API 处理器。
package handler

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"cowan-panel/backend/internal/model"
	"cowan-panel/backend/internal/service"
)

// ListGroups GET /api/groups
func ListGroups(c *gin.Context) {
	var gs []model.Group
	if err := service.DB.Order("sort asc, id asc").Find(&gs).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gs)
}

// CreateGroup POST /api/groups
func CreateGroup(c *gin.Context) {
	var g model.Group
	if err := c.ShouldBindJSON(&g); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := service.DB.Create(&g).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, g)
}

// UpdateGroup PUT /api/groups/:id  部分字段更新（name / sort / lan）
func UpdateGroup(c *gin.Context) {
	var g model.Group
	if err := service.DB.First(&g, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "group not found"})
		return
	}
	var in map[string]any
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	for k, v := range in {
		switch k {
		case "name":
			g.Name = fmt.Sprint(v)
		case "sort":
			if f, ok := v.(float64); ok {
				g.Sort = int(f)
			}
		case "lan":
			if b, ok := v.(bool); ok {
				g.LAN = b
			}
		}
	}
	if err := service.DB.Save(&g).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, g)
}

// DeleteGroup DELETE /api/groups/:id（级联删除其下 items）
func DeleteGroup(c *gin.Context) {
	id := c.Param("id")
	if err := service.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("group_id = ?", id).Delete(&model.Item{}).Error; err != nil {
			return err
		}
		return tx.Delete(&model.Group{}, id).Error
	}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// SortGroups PUT /api/groups/sort  body: {ids:[...]}
func SortGroups(c *gin.Context) {
	sortItems(c, new(model.Group))
}

// ListItems GET /api/items?groupId=
func ListItems(c *gin.Context) {
	var its []model.Item
	q := service.DB.Order("sort asc, id asc")
	if gid := c.Query("groupId"); gid != "" {
		q = q.Where("group_id = ?", gid)
	}
	if err := q.Find(&its).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, its)
}

// CreateItem POST /api/items
func CreateItem(c *gin.Context) {
	var it model.Item
	if err := c.ShouldBindJSON(&it); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if it.LastStatus == "" {
		it.LastStatus = "unknown"
	}
	if err := service.DB.Create(&it).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, it)
}

// UpdateItem PUT /api/items/:id  支持部分字段更新（只改请求里出现的字段）
func UpdateItem(c *gin.Context) {
	var it model.Item
	if err := service.DB.First(&it, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "item not found"})
		return
	}
	var in map[string]any
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	patchItem(&it, in)
	// 探测结果字段不允许通过该接口修改
	it.LastStatus = ""
	it.LastCheckedAt = nil
	if err := service.DB.Omit("LastStatus", "LastCheckedAt").Save(&it).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, it)
}

// patchItem 只应用请求中出现的字段，避免整模型覆盖丢数据
func patchItem(it *model.Item, in map[string]any) {
	for k, v := range in {
		switch k {
		case "name":
			it.Name = fmt.Sprint(v)
		case "url":
			it.URL = fmt.Sprint(v)
		case "iconUrl", "icon_url":
			it.IconURL = fmt.Sprint(v)
		case "description":
			it.Description = fmt.Sprint(v)
		case "cardBackgroundColor", "card_background_color":
			it.CardBackgroundColor = fmt.Sprint(v)
		case "sort":
			if f, ok := v.(float64); ok {
				it.Sort = int(f)
			}
		case "openInNewTab", "open_in_new_tab":
			if b, ok := v.(bool); ok {
				it.OpenInNewTab = b
			}
		case "checkEnabled", "check_enabled":
			if b, ok := v.(bool); ok {
				it.CheckEnabled = b
			}
		case "groupId", "group_id":
			if f, ok := v.(float64); ok {
				it.GroupID = uint(f)
			}
		}
	}
}

// DeleteItem DELETE /api/items/:id
func DeleteItem(c *gin.Context) {
	if err := service.DB.Delete(&model.Item{}, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// SortItems PUT /api/items/sort  body: {ids:[...]}
func SortItems(c *gin.Context) {
	sortItems(c, new(model.Item))
}

// sortItems 按 ids 顺序写 Sort 字段（下标即序号）。
func sortItems(c *gin.Context, m any) {
	var body struct {
		IDs []uint `json:"ids"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || len(body.IDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ids required"})
		return
	}
	for i, id := range body.IDs {
		if err := service.DB.Model(m).Where("id = ?", id).Update("sort", i).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
