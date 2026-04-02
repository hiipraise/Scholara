import { Menu } from 'lucide-react';
import { useLocation } from 'react-router-dom';

const PAGE_TITLES: Record<string, string> = {
  '/': 'Home Feed',
  '/courses': 'Courses',
  '/study': 'Study Cycle',
  '/profile': 'Profile',
  '/admin': 'Admin Panel',
};

interface TopBarProps {
  onMenuClick: () => void;
}

export default function TopBar({ onMenuClick }: TopBarProps) {
  const location = useLocation();
  const title = PAGE_TITLES[location.pathname] || 'Scholara';

  return (
    <header className="lg:hidden sticky top-0 z-20 bg-indigo-900/95 backdrop-blur-md border-b border-cream-200/8 px-4 h-14 flex items-center gap-4">
      <button
        onClick={onMenuClick}
        className="p-2 rounded-xl text-cream-200/50 hover:text-cream-200/80 hover:bg-cream-200/8 transition-colors -ml-1"
      >
        <Menu size={20} />
      </button>
      <span className="font-display text-lg font-semibold text-cream-200">{title}</span>
    </header>
  );
}
