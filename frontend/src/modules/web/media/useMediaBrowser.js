import { useCallback, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { cmsApi } from "../api/cms";
import { mediaUploadSizeError } from "./mediaUpload";

/**
 * Shared media query hook used by both MediaLibrary (admin) and
 * MediaBrowser (picker). Centralizes folder listing, media pagination,
 * upload, and move logic so the two views share the same state shape.
 */
export default function useMediaBrowser({ initialFolderId = null, limit = 24 } = {}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const inputRef = useRef(null);
  const [error, setError] = useState("");
  const [selectedFolder, setSelectedFolder] = useState(initialFolderId);
  const [page, setPage] = useState(0);

  const foldersQuery = useQuery({ queryKey: ["web", "media", "folders"], queryFn: cmsApi.listFolders });
  const folders = foldersQuery.data?.items || [];

  const mediaQuery = useQuery({
    queryKey: ["web", "media", { folder: selectedFolder, page, limit }],
    queryFn: () => cmsApi.listMedia({
      folder_id: selectedFolder ?? undefined,
      offset: page * limit,
      limit,
    }),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["web", "media"] });
  };

  const upload = useMutation({
    mutationFn: (file) => cmsApi.uploadMedia(file, { folder_id: selectedFolder }),
    onSuccess: invalidate,
    onError: (err) => setError(err?.response?.data?.detail?.toString() || "Upload failed"),
  });

  const remove = useMutation({ mutationFn: cmsApi.deleteMedia, onSuccess: invalidate });
  const moveMedia = useMutation({ mutationFn: ({ mediaId, folderId }) => cmsApi.updateMedia(mediaId, { folder_id: folderId }), onSuccess: invalidate });

  const handleUpload = useCallback((e) => {
    const file = e.target.files?.[0];
    const sizeError = mediaUploadSizeError(file, t);
    if (sizeError) setError(sizeError);
    else if (file) {
      setError("");
      upload.mutate(file);
    }
    if (inputRef.current) inputRef.current.value = "";
  }, [t, upload]);

  const media = Array.isArray(mediaQuery.data) ? mediaQuery.data : mediaQuery.data?.items || [];
  const total = mediaQuery.data?.total ?? media.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return {
    inputRef,
    error,
    setError,
    selectedFolder,
    setSelectedFolder,
    page,
    setPage,
    folders,
    foldersQuery,
    media,
    mediaQuery,
    total,
    totalPages,
    upload,
    remove,
    moveMedia,
    handleUpload,
    invalidate,
  };
}
