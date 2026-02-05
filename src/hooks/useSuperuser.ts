 import { useQuery } from '@tanstack/react-query';
 import { supabase } from '@/integrations/supabase/client';
 import { useAuth } from '@/contexts/AuthContext';
 
 export function useSuperuser() {
   const { user } = useAuth();
 
   const { data: isSuperuser = false, isLoading } = useQuery({
     queryKey: ['superuser', user?.id],
     queryFn: async () => {
       if (!user?.id) return false;
       
       const { data, error } = await supabase
         .from('superusers')
         .select('id')
         .eq('user_id', user.id)
         .maybeSingle();
       
       if (error) {
         console.error('Error checking superuser status:', error);
         return false;
       }
       
       return !!data;
     },
     enabled: !!user?.id,
   });
 
   return { isSuperuser, isLoading };
 }