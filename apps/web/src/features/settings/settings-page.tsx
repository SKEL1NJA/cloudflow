import { useSearchParams } from 'react-router';
import { z } from 'zod';
import { PageHeader } from '@/components/layout/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ApiKeysSection } from './api-keys-section';
import { AppearanceSection } from './appearance-section';
import { AuthenticationSection } from './authentication-section';
import { GeneralSection } from './general-section';
import { NotificationsSection } from './notifications-section';

const TAB_VALUES = [
  'general',
  'authentication',
  'api-keys',
  'notifications',
  'appearance',
] as const;
const tabSchema = z.enum(TAB_VALUES).catch('general');

export function SettingsPage() {
  const [search, setSearch] = useSearchParams();
  const tab = tabSchema.parse(search.get('tab') ?? undefined);

  function selectTab(next: string) {
    setSearch(
      (current) => {
        const updated = new URLSearchParams(current);
        updated.set('tab', next);
        return updated;
      },
      { replace: true },
    );
  }

  return (
    <>
      <PageHeader title="Settings" description="Your account, API keys and preferences." />
      <Tabs value={tab} onValueChange={selectTab}>
        <TabsList className="overflow-x-auto">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="authentication">Authentication</TabsTrigger>
          <TabsTrigger value="api-keys">API keys</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
        </TabsList>
        <TabsContent value="general">
          <GeneralSection />
        </TabsContent>
        <TabsContent value="authentication">
          <AuthenticationSection />
        </TabsContent>
        <TabsContent value="api-keys">
          <ApiKeysSection />
        </TabsContent>
        <TabsContent value="notifications">
          <NotificationsSection />
        </TabsContent>
        <TabsContent value="appearance">
          <AppearanceSection />
        </TabsContent>
      </Tabs>
    </>
  );
}
