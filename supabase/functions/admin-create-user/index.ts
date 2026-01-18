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

    const { email, password, full_name, role, sector_ids, admin_secret, bootstrap_key } = await req.json();

    // Check authorization: bootstrap key, admin secret, or JWT
    const authHeader = req.headers.get("authorization");
    
    // Bootstrap mode - allows initial admin creation with a specific key
    const BOOTSTRAP_KEY = "innovatia-bootstrap-2026";
    
    if (bootstrap_key === BOOTSTRAP_KEY) {
      console.log("Authorized via bootstrap key");
    } else if (admin_secret) {
      // Admin secret mode - use last 16 chars of service role key as secret
      const expectedSecret = serviceRoleKey.slice(-16);
      if (admin_secret !== expectedSecret) {
        throw new Error("Invalid admin secret");
      }
      console.log("Authorized via admin secret");
    } else if (authHeader) {
      // JWT mode - verify the calling user is an admin
      const token = authHeader.replace("Bearer ", "");
      const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
      
      if (userError || !userData.user) {
        throw new Error("Invalid authorization token");
      }

      const { data: callerRoles } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", userData.user.id);

      const isAdmin = callerRoles?.some(r => r.role === "ADMIN" || r.role === "MANAGER");
      if (!isAdmin) {
        throw new Error("Only admins can create users");
      }
      console.log("Authorized via JWT for user:", userData.user.email);
    } else {
      throw new Error("Authorization required");
    }

    console.log("Creating user with email:", email);

    // Validate required fields
    if (!email || !password || !full_name) {
      throw new Error("Email, password, and full_name are required");
    }

    // Create user via Admin API
    const { data: newUserData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });

    if (createError) {
      console.error("Error creating user:", createError);
      throw createError;
    }

    const userId = newUserData.user.id;
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