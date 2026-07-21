import React, {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "../auth/AuthContext";
import { errorMessage } from "../lib/errors";
import { supabase } from "../lib/supabase";
import {
  HouseholdMember,
  ParentLabel,
  PendingInvite,
  Workspace,
} from "../types";

interface WorkspaceContextValue {
  loading: boolean;
  workspace: Workspace | null;
  error: string | null;
  refresh: () => Promise<void>;
  createHousehold: (input: {
    householdName: string;
    displayName: string;
    parentLabel: ParentLabel;
    childName: string;
  }) => Promise<void>;
  joinHousehold: (input: {
    inviteCode: string;
    displayName: string;
    parentLabel: ParentLabel;
  }) => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function inviteFrom(data: unknown): PendingInvite | null {
  const value = Array.isArray(data) ? data[0] : data;
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = row.invite_id;
  const code = row.invite_code;
  const expiresAt = row.expires_at;
  if (
    typeof id !== "string" ||
    typeof code !== "string" ||
    typeof expiresAt !== "string"
  ) {
    return null;
  }
  const parent = row.parent_label;
  return {
    id,
    code: code.trim().toUpperCase(),
    expiresAt,
    createdAt: new Date().toISOString(),
    parentLabel:
      parent === "Dad" || parent === "Mum" ? parent : undefined,
  };
}

export function WorkspaceProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadedOnce = useRef(false);
  const refreshInFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;

    if (!supabase || !user) {
      setWorkspace(null);
      setLoading(false);
      refreshInFlight.current = false;
      return;
    }

    if (!loadedOnce.current) setLoading(true);
    setError(null);

    try {
      const { data: membership, error: membershipError } = await supabase
        .from("household_members")
        .select("household_id, role, display_name, parent_label")
        .eq("user_id", user.id)
        .order("joined_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (membershipError) throw membershipError;
      if (!membership) {
        setWorkspace(null);
        return;
      }

      const [householdResult, childResult, membersResult, invitesResult] =
        await Promise.all([
          supabase
            .from("households")
            .select("id, name")
            .eq("id", membership.household_id)
            .single(),
          supabase
            .from("children")
            .select("id")
            .eq("household_id", membership.household_id)
            .order("created_at")
            .limit(1)
            .single(),
          supabase
            .from("household_members")
            .select("user_id, display_name, parent_label, role")
            .eq("household_id", membership.household_id)
            .order("joined_at"),
          supabase
            .from("household_invites")
            .select(
              "id, intended_parent_label, display_code, expires_at, created_at",
            )
            .eq("household_id", membership.household_id)
            .is("accepted_at", null)
            .is("revoked_at", null)
            .gt("expires_at", new Date().toISOString())
            .order("created_at", { ascending: false }),
        ]);

      if (householdResult.error) throw householdResult.error;
      if (childResult.error) throw childResult.error;
      if (membersResult.error) throw membersResult.error;
      if (invitesResult.error) throw invitesResult.error;

      const members: HouseholdMember[] = (membersResult.data ?? []).map(
        (row) => ({
          userId: row.user_id,
          displayName: row.display_name,
          parentLabel: row.parent_label ?? undefined,
          role: row.role,
        }),
      );

      const pendingInvites: PendingInvite[] = (invitesResult.data ?? []).map(
        (row) => ({
          id: row.id,
          parentLabel:
            row.intended_parent_label === "Dad" ||
            row.intended_parent_label === "Mum"
              ? row.intended_parent_label
              : undefined,
          code: row.display_code ?? undefined,
          expiresAt: row.expires_at,
          createdAt: row.created_at,
        }),
      );

      const householdId = membership.household_id as string;

      const createInvite = async (
        parentLabel: ParentLabel,
      ): Promise<PendingInvite> => {
        if (!supabase) throw new Error("Supabase is not configured.");

        const result = await supabase.rpc("create_household_invite_v4", {
          p_household_id: householdId,
          p_parent_label: parentLabel,
        });

        if (result.error) {
          throw new Error(
            errorMessage(result.error, "Could not create an invite code."),
          );
        }

        const invite = inviteFrom(result.data);
        if (!invite) {
          throw new Error(
            "Supabase created the invitation but did not return its code. Run the HomeBridge v1.0 database patch.",
          );
        }

        setWorkspace((current) =>
          current
            ? {
                ...current,
                pendingInvites: [
                  invite,
                  ...current.pendingInvites.filter(
                    (item) => item.parentLabel !== parentLabel,
                  ),
                ],
              }
            : current,
        );
        return invite;
      };

      const revokeInvite = async (inviteId: string): Promise<void> => {
        if (!supabase) throw new Error("Supabase is not configured.");
        const { error: revokeError } = await supabase.rpc(
          "revoke_household_invite",
          { p_invite_id: inviteId },
        );
        if (revokeError) throw new Error(errorMessage(revokeError));
        setWorkspace((current) =>
          current
            ? {
                ...current,
                pendingInvites: current.pendingInvites.filter(
                  (item) => item.id !== inviteId,
                ),
              }
            : current,
        );
      };

      setWorkspace({
        householdId,
        householdName: householdResult.data.name,
        childId: childResult.data.id,
        userId: user.id,
        displayName: membership.display_name,
        parentLabel: membership.parent_label ?? undefined,
        role: membership.role,
        members,
        pendingInvites,
        createInvite,
        revokeInvite,
        refreshWorkspace: refresh,
      });
    } catch (caught) {
      const message = errorMessage(
        caught,
        "Could not refresh the shared household.",
      );
      setError(message);
      if (!loadedOnce.current) setWorkspace(null);
    } finally {
      loadedOnce.current = true;
      setLoading(false);
      refreshInFlight.current = false;
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!supabase || !workspace?.householdId) return;
    const householdId = workspace.householdId;
    const channel = supabase
      .channel(`homebridge-workspace-${householdId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "household_members",
          filter: `household_id=eq.${householdId}`,
        },
        () => void refresh(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "household_invites",
          filter: `household_id=eq.${householdId}`,
        },
        () => void refresh(),
      )
      .subscribe();

    return () => {
      void supabase?.removeChannel(channel);
    };
  }, [workspace?.householdId, refresh]);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      loading,
      workspace,
      error,
      refresh,
      createHousehold: async ({
        householdName,
        displayName,
        parentLabel,
        childName,
      }) => {
        if (!supabase) throw new Error("Supabase is not configured.");
        const { error: rpcError } = await supabase.rpc(
          "create_household_with_child",
          {
            p_household_name: householdName.trim(),
            p_display_name: displayName.trim(),
            p_parent_label: parentLabel,
            p_child_name: childName.trim(),
          },
        );
        if (rpcError) throw new Error(errorMessage(rpcError));
        await refresh();
      },
      joinHousehold: async ({ inviteCode, displayName, parentLabel }) => {
        if (!supabase) throw new Error("Supabase is not configured.");
        const { error: rpcError } = await supabase.rpc(
          "join_household_by_code",
          {
            p_invite_code: inviteCode.trim().toUpperCase(),
            p_display_name: displayName.trim(),
            p_parent_label: parentLabel,
          },
        );
        if (rpcError) throw new Error(errorMessage(rpcError));
        await refresh();
      },
    }),
    [loading, workspace, error, refresh],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) {
    throw new Error("useWorkspace must be used inside WorkspaceProvider");
  }
  return value;
}
