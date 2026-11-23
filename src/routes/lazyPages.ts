import { lazy } from 'react';
import { PublicLoadFailure } from '../components/molecules/PublicLoadFailure';

// Keep route loading here so App only composes navigation and pages.
export const AdministrationPage = lazy(() =>
  import('../pages/AdministrationPage').then((module) => ({ default: module.AdministrationPage })),
);

export const PublicResultsPage = lazy(() =>
  import('../pages/PublicResultsPage')
    .then((module) => ({ default: module.PublicResultsPage }))
    .catch(() => ({ default: PublicLoadFailure })),
);
