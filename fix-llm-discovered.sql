-- Add llm_discovered column to tags table if it doesn't exist
-- Run this in pgAdmin to fix the tag learning issue

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'tags' 
        AND column_name = 'llm_discovered'
    ) THEN
        ALTER TABLE tags 
        ADD COLUMN llm_discovered INTEGER DEFAULT 0;
        
        RAISE NOTICE 'Column llm_discovered added successfully!';
    ELSE
        RAISE NOTICE 'Column llm_discovered already exists!';
    END IF;
END $$;

-- Verify the column was added
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'tags'
ORDER BY ordinal_position;
