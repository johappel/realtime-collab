class ThemeState {
    isDark = $state(false);

    toggle() {
        this.isDark = !this.isDark;
        this.updateDom();
    }

    init() {
        if (typeof window !== 'undefined') {
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            this.isDark = prefersDark;
            this.updateDom();
        }
    }

    updateDom() {
        if (typeof document !== 'undefined') {
            if (this.isDark) {
                document.documentElement.classList.add('dark');
            } else {
                document.documentElement.classList.remove('dark');
            }
        }
    }
}

export const theme = new ThemeState();
