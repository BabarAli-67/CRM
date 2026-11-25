import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../config/api.config.js';
import { getMockupFileUrl } from '../services/mockup.service.js';

/** Authenticated blob URL for mockup logo / video file. */
export default function useMockupFile(mockupId, field, enabled = true) {
  const canFetch = Boolean(mockupId) && Boolean(field) && enabled;

  const { data: url, isLoading, isError } = useQuery({
    queryKey: ['mockupFile', mockupId, field],
    enabled: canFetch,
    gcTime: 0,
    staleTime: Infinity,
    queryFn: async () => {
      const response = await api({
        url: getMockupFileUrl(mockupId, field),
        method: 'GET',
        responseType: 'blob',
      });
      return URL.createObjectURL(response.data);
    },
  });

  useEffect(() => {
    if (!url) return undefined;
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [url]);

  return {
    url: canFetch ? url : undefined,
    isLoading: canFetch && isLoading,
    isError: canFetch && isError,
  };
}
