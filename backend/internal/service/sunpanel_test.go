// sun-panel 导入/导出单元测试：用手写小样例验证双向同构。
package service

import (
	"strings"
	"testing"

	"cowan-panel/backend/internal/model"
)

// 手写 sun-panel v1 小样例（含 itemType 0、本地 /uploads 路径、http 外链、openMethod 1/2）
const sample = `{
  "version": 1,
  "appName": "Sun-Panel-Config",
  "exportTime": "2024-05-01 10:00:00",
  "appVersion": "1.8.1",
  "md5": "abc123",
  "icons": [
    {
      "title": "AI",
      "sort": 1,
      "children": [
        {
          "icon": { "itemType": 2, "src": "https://example.com/logo.png", "text": "", "backgroundColor": "" },
          "sort": 0, "title": "DeepSeek", "url": "https://chat.deepseek.com/",
          "lanUrl": "", "description": "AI 聊天", "openMethod": 2, "cardType": 1,
          "backgroundColor": "#2a2a2a6b", "expandParam": {}
        },
        {
          "icon": { "itemType": 0, "src": "", "text": "", "backgroundColor": "" },
          "sort": 1, "title": "Local Service", "url": "http://192.168.1.10:5000",
          "lanUrl": "", "description": "", "openMethod": 1, "cardType": 1,
          "backgroundColor": "", "expandParam": {}
        },
        {
          "icon": { "itemType": 2, "src": "/uploads/2024/05/xxx.svg", "text": "", "backgroundColor": "" },
          "sort": 2, "title": "Old Upload", "url": "https://old.example.com",
          "lanUrl": "", "description": "", "openMethod": 2, "cardType": 1,
          "backgroundColor": "#fff", "expandParam": {}
        }
      ],
      "cardStyle": { "style": 1, "textColor": "#ffffff" }
    }
  ],
  "bulletins": [],
  "settings": {}
}`

// testDB 用内存 SQLite 初始化测试库。
func testDB(t *testing.T) {
	t.Helper()
	old := DB
	db, err := openMemory()
	if err != nil {
		t.Fatal(err)
	}
	DB = db
	if err := DB.AutoMigrate(&model.Group{}, &model.Item{}, &model.Setting{}); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { DB = old })
}

// TestImportExportSunPanel 导入→校验映射→导出→重新导入（同构互导）。
func TestImportExportSunPanel(t *testing.T) {
	testDB(t)

	// 1) 导入
	g, i, err := ImportSunPanel([]byte(sample), "overwrite")
	if err != nil {
		t.Fatal("导入失败:", err)
	}
	if g != 1 || i != 3 {
		t.Fatalf("导入数量不符: groups=%d items=%d，期望 1/3", g, i)
	}

	// 2) 校验映射规则
	var items []model.Item
	DB.Order("sort asc, id asc").Find(&items)
	// http 外链保留
	if items[0].IconURL != "https://example.com/logo.png" {
		t.Errorf("外链图标应保留，实际 %q", items[0].IconURL)
	}
	// itemType 0 → 空
	if items[1].IconURL != "" {
		t.Errorf("itemType 0 图标应置空，实际 %q", items[1].IconURL)
	}
	// /uploads/... → 空（导入时不抓 favicon）
	if items[2].IconURL != "" {
		t.Errorf("/uploads 路径图标应置空，实际 %q", items[2].IconURL)
	}
	// openMethod 映射
	if !items[0].OpenInNewTab || items[1].OpenInNewTab {
		t.Errorf("openMethod 映射错误: %v %v", items[0].OpenInNewTab, items[1].OpenInNewTab)
	}
	if items[0].CardBackgroundColor != "#2a2a2a6b" {
		t.Errorf("卡片背景色应保留，实际 %q", items[0].CardBackgroundColor)
	}

	// 3) 导出
	data, err := ExportSunPanel()
	if err != nil {
		t.Fatal("导出失败:", err)
	}
	out := string(data)
	for _, want := range []string{`"version": 1`, `"appName": "Cowan-Panel-Config"`, `"icons": [`, `"bulletins": []`, `"title": "DeepSeek"`} {
		if !contains(out, want) {
			t.Errorf("导出 JSON 缺少 %s", want)
		}
	}

	// 4) 导出的 JSON 再导回（overwrite），数据一致
	g2, i2, err := ImportSunPanel(data, "overwrite")
	if err != nil {
		t.Fatal("回导失败:", err)
	}
	if g2 != 1 || i2 != 3 {
		t.Fatalf("回导数量不符: %d/%d", g2, i2)
	}
	var items2 []model.Item
	DB.Order("sort asc, id asc").Find(&items2)
	if len(items2) != len(items) {
		t.Fatalf("回导后 item 数不符: %d vs %d", len(items2), len(items))
	}
	for k := range items {
		if items[k].Name != items2[k].Name || items[k].URL != items2[k].URL ||
			items[k].IconURL != items2[k].IconURL || items[k].OpenInNewTab != items2[k].OpenInNewTab {
			t.Errorf("回导后第 %d 项不一致: %+v vs %+v", k, items[k], items2[k])
		}
	}
}

// TestImportAppend 追加模式不清空已有数据。
func TestImportAppend(t *testing.T) {
	testDB(t)
	if _, _, err := ImportSunPanel([]byte(sample), "overwrite"); err != nil {
		t.Fatal(err)
	}
	g, i, err := ImportSunPanel([]byte(sample), "append")
	if err != nil {
		t.Fatal(err)
	}
	if g != 1 || i != 3 {
		t.Fatalf("追加导入数量不符: %d/%d", g, i)
	}
	var gc, ic int64
	DB.Model(&model.Group{}).Count(&gc)
	DB.Model(&model.Item{}).Count(&ic)
	if gc != 2 || ic != 6 {
		t.Fatalf("追加后总数不符: groups=%d items=%d，期望 2/6", gc, ic)
	}
}

func contains(s, sub string) bool { return strings.Contains(s, sub) }
