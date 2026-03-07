// ── Avenue-X: App Shell ──

import { AppProvider } from './context/AppContext';
import TransitionOrchestrator from './components/TransitionOrchestrator';

export default function App() {
    return (
        <AppProvider>
            <div className="w-screen h-screen overflow-hidden bg-gray-950">
                <TransitionOrchestrator />
            </div>
        </AppProvider>
    );
}
