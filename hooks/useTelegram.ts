
import { useState, useEffect } from 'react';
import { TelegramWebApp, TelegramUser } from '../types';

declare global {
    interface Window {
        Telegram: {
            WebApp: TelegramWebApp;
        };
    }
}

export function useTelegram() {
    const [tg, setTg] = useState<TelegramWebApp | null>(null);

    useEffect(() => {
        if (typeof window !== 'undefined' && window.Telegram && window.Telegram.WebApp) {
            setTg(window.Telegram.WebApp);
        }
    }, []);

    return {
        tg,
        user: tg?.initDataUnsafe?.user,
        queryId: tg?.initDataUnsafe?.query_id
    };
}
