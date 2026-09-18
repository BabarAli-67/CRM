import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../config/api.config.js';
import { getAttachmentUrl } from '../services/chat.service.js';

/**
 * Authenticated blob fetch for chat attachments → temporary object URL.
 * Revokes the URL when it changes or the consumer unmounts.
 */
export default function useAuthenticatedFile(conversationId, storedFilename) {
  const enabled = Boolean(conversationId) && Boolean(storedFilename);

  const { data: url, isLoading, isError } = useQuery({
    queryKey: ['chatFile', conversationId, storedFilename],
    enabled,
    // Object URLs must not outlive their blob; drop from cache when unused.
    gcTime: 0,
    staleTime: Infinity,
    queryFn: async () => {
      const response = await api({
        url: getAttachmentUrl(conversationId, storedFilename),
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
    url: enabled ? url : undefined,
    isLoading: enabled && isLoading,
    isError: enabled && isError,
  };
}
