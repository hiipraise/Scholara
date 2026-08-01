import { Outlet } from 'react-router-dom';
import FloatingBentoMenu from './FloatingBentoMenu';
import InstallPrompt from '../InstallPrompt';
import NetworkBanner from '../NetworkBanner';
import PendingSyncIndicator from '../PendingSyncIndicator';

export default function Layout() {
  return (
    <div className="flex min-h-screen overflow-x-hidden bg-indigo-600">
      <div className="flex-1 flex flex-col min-w-0">
        <NetworkBanner />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
          <Outlet />
        </main>
      </div>
      <PendingSyncIndicator />
      <InstallPrompt />
      <FloatingBentoMenu />
    </div>
  );
}
