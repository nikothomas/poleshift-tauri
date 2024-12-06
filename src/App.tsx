// src/App.tsx
import React from 'react';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterLuxon } from '@mui/x-date-pickers/AdapterLuxon';
import { ThemeProvider } from '@mui/material/styles';
import { PowerSyncContext } from '@powersync/react';

import { theme } from './theme';
import AppRoutes from './routes/AppRoutes';
import './App.css';
import { db, setupPowerSync } from './lib/powersync/db';

function App() {
    const [initialized, setInitialized] = React.useState(false);

    React.useEffect(() => {
        (async () => {
            await setupPowerSync(); // Connect to PowerSync
            setInitialized(true);
        })();
    }, []);

    if (!initialized) {
        return <div>Initializing PowerSync...</div>;
    }

    return (
        <PowerSyncContext.Provider value={db}>
            <LocalizationProvider dateAdapter={AdapterLuxon}>
                <ThemeProvider theme={theme}>
                    <AppRoutes />
                </ThemeProvider>
            </LocalizationProvider>
        </PowerSyncContext.Provider>
    );
}

export default App;
