import React, { useEffect, useState } from 'react';
import {
  Button, Divider, Form, Input, Modal, Select, Space, Switch, Upload, message as antdMessage,
} from 'antd';
import { ReloadOutlined, UploadOutlined } from '@ant-design/icons';
import { usePanelStore } from '../stores/panel';
import * as apiClient from '../api';
import type { Group, Item } from '../types';

/** 卡片新增/编辑弹窗（首页右键菜单与设置页共用） */
export const ItemEditor: React.FC<{
  open: boolean;
  editing?: Item | null;
  groups: Group[];
  defaultGroupId?: number;
  onClose: () => void;
}> = ({ open, editing, groups, defaultGroupId, onClose }) => {
  const [form] = Form.useForm();
  const [fetching, setFetching] = useState(false);
  const { addItem, editItem } = usePanelStore();

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      name: editing?.name ?? '',
      url: editing?.url ?? '',
      description: editing?.description ?? '',
      groupId: editing?.groupId ?? defaultGroupId ?? groups[0]?.id,
      iconUrl: editing?.iconUrl ?? '',
      cardBackgroundColor: editing?.cardBackgroundColor ?? '',
      openInNewTab: editing?.openInNewTab ?? true,
      checkEnabled: editing?.checkEnabled ?? false,
    });
  }, [open, editing, defaultGroupId, groups, form]);

  const fetchFavicon = async () => {
    const url: string = form.getFieldValue('url');
    if (!url) return antdMessage.warning('请先填写站点地址');
    setFetching(true);
    try {
      const iconUrl = await apiClient.fetchFavicon(url);
      form.setFieldsValue({ iconUrl });
      antdMessage.success('抓取成功');
    } catch {
      antdMessage.error('抓取失败（404）');
    } finally {
      setFetching(false);
    }
  };

  const ok = async () => {
    const values = await form.validateFields();
    const data = { ...values, iconUrl: values.iconUrl || null };
    try {
      if (editing) await editItem(editing.id, data);
      else await addItem(data);
      antdMessage.success('已保存');
      onClose();
    } catch {
      antdMessage.error('保存失败');
    }
  };

  return (
    <Modal
      title={editing ? '编辑卡片' : '新增卡片'}
      open={open}
      onCancel={onClose}
      onOk={ok}
      width={520}
      destroyOnClose
    >
      <Form form={form} layout="vertical">
        <Form.Item name="groupId" label="所属分组" rules={[{ required: true }]}>
          <Select options={groups.map((g) => ({ value: g.id, label: g.name }))} />
        </Form.Item>
        <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
          <Input placeholder="如：DeepSeek" />
        </Form.Item>
        <Form.Item name="url" label="URL" rules={[{ required: true, message: '请输入地址' }]}>
          <Input placeholder="https://..." />
        </Form.Item>
        <Form.Item name="description" label="描述">
          <Input placeholder="可选" />
        </Form.Item>
        <Form.Item label="图标" required style={{ marginBottom: 0 }}>
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item name="iconUrl" noStyle>
              <Input placeholder="图片 URL，留空用首字母占位" />
            </Form.Item>
            <Upload
              accept="image/*"
              showUploadList={false}
              customRequest={async ({ file }) => {
                try {
                  const url = await apiClient.uploadIcon(file as File);
                  form.setFieldsValue({ iconUrl: url });
                  antdMessage.success('上传成功');
                } catch {
                  antdMessage.error('上传失败');
                }
              }}
            >
              <Button icon={<UploadOutlined />}>上传</Button>
            </Upload>
            <Button icon={<ReloadOutlined />} loading={fetching} onClick={fetchFavicon}>
              抓取 favicon
            </Button>
          </Space.Compact>
        </Form.Item>
        <Divider style={{ margin: '12px 0' }} />
        <Space size="large" wrap>
          <Form.Item name="openInNewTab" label="新标签页打开" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="cardBackgroundColor" label="卡片背景色">
            <Input placeholder="如 #2a2a2a6b，可选" style={{ width: 180 }} />
          </Form.Item>
        </Space>
      </Form>
    </Modal>
  );
};
