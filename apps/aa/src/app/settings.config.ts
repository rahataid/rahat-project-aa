let app = {
    settings: null, // {name,value}
};

module.exports = {
    setSettings: (data: any) => {
        app.settings = data;
    },
    listSettings: () => app.settings,
    getSettings: (name: string) => {
        if (!name) return null;
        name = name.toUpperCase();
        if (!app.settings) return null;
        return app.settings[name];
    },
};