import { lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { NotFoundPage } from '@/pages/System';

const HubPage = lazy(() => import('./Hub').then((m) => ({ default: m.HubPage })));
const ClubsPage = lazy(() => import('./Hub').then((m) => ({ default: m.ClubsPage })));
const ClubPage = lazy(() => import('./Hub').then((m) => ({ default: m.ClubPage })));
const EventsPage = lazy(() => import('./Hub').then((m) => ({ default: m.EventsPage })));
const EventPage = lazy(() => import('./Hub').then((m) => ({ default: m.EventPage })));
const ResourcesPage = lazy(() => import('./Resources'));
const RewardsPage = lazy(() => import('./Rewards'));
const EventPosterPage = lazy(() => import('./Poster'));
const MapPage = lazy(() => import('./Map'));
const LostFoundPage = lazy(() => import('./LostFound'));
const CommunityRoutes = lazy(() => import('./Community'));

export default function CampusRoutes() {
  return (
    <Routes>
      <Route index element={<HubPage />} />
      <Route path="clubs" element={<ClubsPage />} />
      <Route path="clubs/:id" element={<ClubPage />} />
      <Route path="events" element={<EventsPage />} />
      <Route path="events/:id" element={<EventPage />} />
      <Route path="events/:id/poster" element={<EventPosterPage />} />
      <Route path="resources" element={<ResourcesPage />} />
      <Route path="rewards" element={<RewardsPage />} />
      <Route path="map" element={<MapPage />} />
      <Route path="lost-found/*" element={<LostFoundPage />} />
      <Route path="community/*" element={<CommunityRoutes />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
