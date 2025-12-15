import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    if (!serviceRoleKey) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
    }

    // Create admin client with service role key
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { email, password, full_name, role, sector_ids } = await req.json();

    console.log("Creating user with email:", email);

    // Validate required fields
    if (!email || !password || !full_name) {
      throw new Error("Email, password, and full_name are required");
    }

    // Create user via Admin API
    const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });

    if (createError) {
      console.error("Error creating user:", createError);
      throw createError;
    }

    const userId = userData.user.id;
    console.log("User created with ID:", userId);

    // The handle_new_user trigger should create the profile automatically,
    // but let's upsert to ensure it exists with correct data
    const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
      id: userId,
      email,
      full_name,
    });

    if (profileError) {
      console.error("Error creating/updating profile:", profileError);
      // Don't throw - user was created, profile might exist from trigger
    }

    // Assign role if provided
    if (role) {
      const { error: roleError } = await supabaseAdmin.from("user_roles").insert({
        user_id: userId,
        role,
      });

      if (roleError) {
        console.error("Error assigning role:", roleError);
        // Don't throw - user was created
      } else {
        console.log("Role assigned:", role);
      }
    }

    // Assign sectors if provided
    if (sector_ids && sector_ids.length > 0) {
      const sectorInserts = sector_ids.map((sector_id: string) => ({
        user_id: userId,
        sector_id,
      }));

      const { error: sectorError } = await supabaseAdmin.from("user_sectors").insert(sectorInserts);

      if (sectorError) {
        console.error("Error assigning sectors:", sectorError);
        // Don't throw - user was created
      } else {
        console.log("Sectors assigned:", sector_ids);
      }
    }

    return new Response(
      JSON.stringify({ success: true, user_id: userId }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    console.error("Error in admin-create-user function:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
