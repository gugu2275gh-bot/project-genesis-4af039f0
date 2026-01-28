-- Create case_notes table for technical notes
CREATE TABLE public.case_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  service_case_id UUID NOT NULL REFERENCES public.service_cases(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  note_type VARCHAR(50) DEFAULT 'GENERAL',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by_user_id UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.case_notes ENABLE ROW LEVEL SECURITY;

-- Create policies for internal users (staff)
CREATE POLICY "Staff can view all case notes"
ON public.case_notes
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Staff can create case notes"
ON public.case_notes
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Staff can delete their own notes"
ON public.case_notes
FOR DELETE
TO authenticated
USING (created_by_user_id = auth.uid());

-- Create index for faster queries
CREATE INDEX idx_case_notes_service_case_id ON public.case_notes(service_case_id);
CREATE INDEX idx_case_notes_created_at ON public.case_notes(created_at DESC);