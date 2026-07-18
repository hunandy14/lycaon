import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import './styles.css';
import './components/components.css';
import { HomePage } from './pages/HomePage';
import { NewGamePage } from './pages/NewGamePage';
import { GamePage } from './pages/GamePage';
import { TimelinePage } from './pages/TimelinePage';
import { ReportPage } from './pages/ReportPage';
import { WatchPage } from './pages/WatchPage';
import { GhostPage } from './pages/GhostPage';
import { StatsPage } from './pages/StatsPage';

const router = createBrowserRouter([
  { path: '/', element: <HomePage /> },
  { path: '/new', element: <NewGamePage /> },
  { path: '/game/:id', element: <GamePage /> },
  { path: '/game/:id/timeline', element: <TimelinePage /> },
  { path: '/game/:id/report', element: <ReportPage /> },
  { path: '/watch/:token', element: <WatchPage /> },
  { path: '/ghost/:token', element: <GhostPage /> },
  { path: '/stats', element: <StatsPage /> },
]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
