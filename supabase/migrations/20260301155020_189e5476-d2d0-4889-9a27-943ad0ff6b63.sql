
-- Allow staff to update their own interactions (30-min logic enforced in app)
CREATE POLICY "Staff can update their own interactions"
ON public.interactions
FOR UPDATE
USING (created_by_user_id = auth.uid())
WITH CHECK (created_by_user_id = auth.uid());

-- Allow staff to delete their own interactions
CREATE POLICY "Staff can delete their own interactions"
ON public.interactions
FOR DELETE
USING (created_by_user_id = auth.uid());
