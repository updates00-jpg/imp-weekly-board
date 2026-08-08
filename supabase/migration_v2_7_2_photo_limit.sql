-- Run once after v2.7/v2.7.1.
-- Raises the private task image bucket limit to 4 MB.
update storage.buckets
set file_size_limit = 4194304,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'task-images';
