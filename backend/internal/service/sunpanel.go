// Package service：sun-panel v1 导入/导出。
package service

import (
	"encoding/json"
	"strings"
	"time"

	"gorm.io/gorm"

	"cowan-panel/backend/internal/model"
)

// ---------- sun-panel JSON 结构（同构） ----------

// SunPanelConfig 顶层配置
type SunPanelConfig struct {
	Version     int             `json:"version"`
	AppName     string          `json:"appName"`
	ExportTime  string          `json:"exportTime"`
	AppVersion  string          `json:"appVersion"`
	Md5         string          `json:"md5,omitempty"`
	Icons       []SunPanelGroup `json:"icons"`
	Bulletins   []any           `json:"bulletins"`
	Settings    map[string]any  `json:"settings,omitempty"`
}

// SunPanelGroup 分组（icons[] 的元素）
type SunPanelGroup struct {
	Title     string           `json:"title"`
	Sort      int              `json:"sort"`
	Children  []SunPanelItem   `json:"children"`
	CardStyle map[string]any   `json:"cardStyle,omitempty"`
}

// SunPanelItem 卡片（children[] 的元素）
type SunPanelItem struct {
	Icon              SunPanelIcon `json:"icon"`
	Sort              int          `json:"sort"`
	Title             string       `json:"title"`
	URL               string       `json:"url"`
	LanURL            string       `json:"lanUrl"`
	Description       string       `json:"description"`
	OpenMethod        int          `json:"openMethod"`
	CardType          int          `json:"cardType"`
	BackgroundColor   string       `json:"backgroundColor"`
	ExpandParam       map[string]any `json:"expandParam"`
}

// SunPanelIcon 图标定义
type SunPanelIcon struct {
	ItemType        int    `json:"itemType"`
	Src             string `json:"src"`
	Text            string `json:"text"`
	BackgroundColor string `json:"backgroundColor"`
}

// ---------- 导入 ----------

// ImportSunPanel 将 sun-panel JSON（原始字节）导入数据库。
// mode: overwrite 清空重建 / append 追加。返回导入的分组与卡片数量。
func ImportSunPanel(data []byte, mode string) (groups int, items int, err error) {
	var cfg SunPanelConfig
	if err = json.Unmarshal(data, &cfg); err != nil {
		return 0, 0, err
	}
	return importConfig(&cfg, mode)
}

func importConfig(cfg *SunPanelConfig, mode string) (groups, items int, err error) {
	// overwrite 模式：先清空
	if mode != "append" {
		if err := DB.Where("1=1").Delete(&model.Item{}).Error; err != nil {
			return 0, 0, err
		}
		if err := DB.Where("1=1").Delete(&model.Group{}).Error; err != nil {
			return 0, 0, err
		}
	}

	for _, sg := range cfg.Icons {
		g := model.Group{Name: sg.Title, Sort: sg.Sort}
		if err := DB.Create(&g).Error; err != nil {
			return groups, items, err
		}
		groups++
		for _, si := range sg.Children {
			it := model.Item{
				GroupID:             g.ID,
				Name:                si.Title,
				URL:                 si.URL,
				Description:         si.Description,
				Sort:                si.Sort,
				CardBackgroundColor: si.BackgroundColor,
				OpenInNewTab:        si.OpenMethod == 2, // 1=当前页 2=新标签
				LastStatus:          "unknown",
				IconURL:             mapIconSrc(si.Icon),
			}
			if err := DB.Create(&it).Error; err != nil {
				return groups, items, err
			}
			items++
		}
	}
	return groups, items, nil
}

// mapIconSrc 处理图标 src：http(s) 外链保留；/uploads/... 或空（itemType 0）置空
// 由前端占位显示（导入时不抓 favicon，太慢）。
func mapIconSrc(icon SunPanelIcon) string {
	src := strings.TrimSpace(icon.Src)
	lower := strings.ToLower(src)
	if strings.HasPrefix(lower, "http://") || strings.HasPrefix(lower, "https://") {
		return src
	}
	return ""
}

// ---------- 导出 ----------

// ExportSunPanel 将当前库数据导出为 sun-panel 同构 JSON。
func ExportSunPanel() ([]byte, error) {
	var gs []model.Group
	if err := DB.Order("sort asc, id asc").Find(&gs).Error; err != nil {
		return nil, err
	}
	cfg := SunPanelConfig{
		Version:    1,
		AppName:    "Cowan-Panel-Config",
		ExportTime: time.Now().Format("2006-01-02 15:04:05"),
		Icons:      make([]SunPanelGroup, 0, len(gs)),
		Bulletins:  []any{},
	}
	for _, g := range gs {
		sg := SunPanelGroup{Title: g.Name, Sort: g.Sort, Children: []SunPanelItem{}}
		var its []model.Item
		if err := DB.Where("group_id = ?", g.ID).Order("sort asc, id asc").Find(&its).Error; err != nil {
			return nil, err
		}
		for _, it := range its {
			openMethod := 1
			if it.OpenInNewTab {
				openMethod = 2
			}
			sg.Children = append(sg.Children, SunPanelItem{
				Icon: SunPanelIcon{
					ItemType: 0,
					Src:      it.IconURL,
				},
				Sort:            it.Sort,
				Title:           it.Name,
				URL:             it.URL,
				Description:     it.Description,
				OpenMethod:      openMethod,
				CardType:        1,
				BackgroundColor: it.CardBackgroundColor,
				ExpandParam:     map[string]any{},
			})
		}
		cfg.Icons = append(cfg.Icons, sg)
	}
	return json.MarshalIndent(cfg, "", "  ")
}

// ---------- 自有格式全量备份 ----------

// FullBackup 全量备份结构
type FullBackup struct {
	Groups  []model.Group   `json:"groups"`
	Items   []model.Item    `json:"items"`
	Settings []model.Setting `json:"settings"`
}

// ExportFull 导出全量备份 JSON。
func ExportFull() ([]byte, error) {
	b := FullBackup{}
	if err := DB.Order("sort asc, id asc").Find(&b.Groups).Error; err != nil {
		return nil, err
	}
	if err := DB.Order("sort asc, id asc").Find(&b.Items).Error; err != nil {
		return nil, err
	}
	if err := DB.Find(&b.Settings).Error; err != nil {
		return nil, err
	}
	return json.MarshalIndent(b, "", "  ")
}

// ImportFull 从全量备份恢复（覆盖现有数据）。
func ImportFull(data []byte) error {
	var b FullBackup
	if err := json.Unmarshal(data, &b); err != nil {
		return err
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("1=1").Delete(&model.Item{}).Error; err != nil {
			return err
		}
		if err := tx.Where("1=1").Delete(&model.Group{}).Error; err != nil {
			return err
		}
		for i := range b.Groups {
			if err := tx.Create(&b.Groups[i]).Error; err != nil {
				return err
			}
		}
		for i := range b.Items {
			if err := tx.Create(&b.Items[i]).Error; err != nil {
				return err
			}
		}
		for i := range b.Settings {
			if err := tx.Save(&b.Settings[i]).Error; err != nil {
				return err
			}
		}
		return nil
	})
}
