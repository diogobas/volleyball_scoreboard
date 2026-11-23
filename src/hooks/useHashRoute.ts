import { useEffect, useState } from 'react';
import { readRoute } from '../public/routes';

export const useHashRoute = (defaultView = import.meta.env?.VITE_DEFAULT_VIEW) => {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const change = () => {
      setHash(window.location.hash);
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  return readRoute(hash, defaultView);
};
