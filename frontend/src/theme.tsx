import { useEffect, useState } from 'react';
import { theme as antdTheme, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { usePanelStore } from './stores/panel';

export function useSystemDark() {
  const [dark, setDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const fn = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return dark;
}

export function useIsDark() {
  const theme = usePanelStore((s) => s.settings.theme);
  const sysDark = useSystemDark();
  return theme === 'dark' || (theme === 'auto' && sysDark);
}

export function ThemedApp({ children }: { children: React.ReactNode }) {
  const isDark = useIsDark();
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: { borderRadius: 8 },
      }}
    >
      {children}
    </ConfigProvider>
  );
}
