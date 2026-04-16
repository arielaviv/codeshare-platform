import api from './api';

export interface AppChatWidget {
  widgetId: string;
  jwt: string;
  proxyUrl: string;
}

export const appChatApi = {
  createWidget: (projectName: string): Promise<AppChatWidget> =>
    api.post('/app-chat/widgets', { projectName }).then((r) => r.data),
};
