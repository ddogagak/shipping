-- Persist the Wise broadcast/video identifier for sales analytics.
ALTER TABLE public.domestic_wise_item_photo
  ADD COLUMN IF NOT EXISTS video_id text;
CREATE INDEX IF NOT EXISTS domestic_wise_item_photo_video_id_idx
  ON public.domestic_wise_item_photo (video_id);
