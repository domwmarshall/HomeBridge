import React, {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useAuth } from '../auth/AuthContext';
import { errorMessage } from '../lib/errors';
import { supabase } from '../lib/supabase';
import {
  HouseholdMember,
  ParentLabel,
  PendingInvite,
  Workspace,
} from '../types';

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

function inviteCodeFrom(data: unknown): string | null {
  if (typeof data === 'string' && data.trim()) return data.trim();
  const value = Array.isArray(data) ? data[0] : data;
  if (value && typeof value === 'object') {
    const code = (value as Record<string, unknown>).invite_code;
    if (typeof code === 'string' && code.trim()) return code.trim();
  }
  return null;
}

export function WorkspaceProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!supabase || !user) {
      setWorkspace(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data: membership, error: membershipError } = await supabase
        .from('household_members')
        .select('household_id, role, display_name, parent_label')
        .eq('user_id', user.id)
        .order('joined_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (membershipError) throw membershipError;
      if (!membership) {
        setWorkspace(null);
        return;
      }

      const [householdResult, childResult, membersResult, invitesResult] = await Promise.all([
        supabase
          .from('households')
          .select('id, name')
          .eq('id', membership.household_id)
          .single(),
        supabase
          .from('children')
          .select('id')
          .eq('household_id', membership.household_id)
          .order('created_at')
          .limit(1)
          .single(),
        supabase
          .from('household_members')
          .select('user_id, display_name, parent_label, role')
          .eq('household_id', membership.household_id)
          .order('joined_at'),
        supabase
          .from('household_invites')
          .select('id, intended_parent_label, expires_at, created_at')
          .eq('household_id', membership.household_id)
          .is('accepted_at', null)
          .is('revoked_at', null)
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false }),
      ]);

      if (householdResult.error) throw householdResult.error;
      if (childResult.error) throw childResult.error;
      if (membersResult.error) throw membersResult.error;
      if (invitesResult.error) throw invitesResult.error;

      const members: HouseholdMember[] = (membersResult.data ?? []).map((row) => ({
        userId: row.user_id,
        displayName: row.display_name,
        parentLabel: row.parent_label ?? undefined,
        role: row.role,
      }));

      const pendingInvites: PendingInvite[] = (invitesResult.data ?? []).map((row) => ({
        id: row.id,
        parentLabel: row.intended_parent_label ?? undefined,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
      }));

      const createInvite = async (parentLabel: ParentLabel): Promise<string> => {
        if (!supabase) throw new Error('Supabase is not configured.');

        const modern = await supabase.rpc('create_household_invite_v3', {
          p_household_id: membership.household_id,
          p_parent_label: parentLabel,
        });

        if (!modern.error) {
          const code = inviteCodeFrom(modern.data);
          if (code) {
            await refresh();
            return code;
          }
        }

        const previous = await supabase.rpc('create_household_invite_v2', {
          p_household_id: membership.household_id,
          p_parent_label: parentLabel,
        });

        if (previous.error) {
          throw new Error(
            errorMessage(
              modern.error ?? previous.error,
              'Could not create an invite code.',
            ),
          );
        }

        const code = inviteCodeFrom(previous.data);
        if (!code) {
          throw new Error(
            'Supabase completed the invite request but returned no code. Run the HomeBridge v0.7 database patch.',
          );
        }

        await refresh();
        return code;
      };

      const revokeInvite = async (inviteId: string): Promise<void> => {
        if (!supabase) throw new Error('Supabase is not configured.');
        const { error: revokeError } = await supabase.rpc('revoke_household_invite', {
          p_invite_id: inviteId,
        });
        if (revokeError) throw new Error(errorMessage(revokeError));
        await refresh();
      };

      setWorkspace({
        householdId: membership.household_id,
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
      setError(errorMessage(caught, 'Could not load the shared household.'));
      setWorkspace(null);
    } finally {
      setLoading(false);
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
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'household_members',
          filter: `household_id=eq.${householdId}`,
        },
        () => void refresh(),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'household_invites',
          filter: `household_id=eq.${householdId}`,
        },
        () => void refresh(),
      )
      .subscribe();

    return () => {
      void supabase?.removeChannel(channel);
    };
  }, [workspace?.householdId, refresh]);

  const value = useMemo<WorkspaceContextValue>(() => ({
    loading,
    workspace,
    error,
    refresh,
    createHousehold: async ({ householdName, displayName, parentLabel, childName }) => {
      if (!supabase) throw new Error('Supabase is not configured.');
      const { error: rpcError } = await supabase.rpc('create_household_with_child', {
        p_household_name: householdName.trim(),
        p_display_name: displayName.trim(),
        p_parent_label: parentLabel,
        p_child_name: childName.trim(),
      });
      if (rpcError) throw new Error(errorMessage(rpcError));
      await refresh();
    },
    joinHousehold: async ({ inviteCode, displayName, parentLabel }) => {
      if (!supabase) throw new Error('Supabase is not configured.');
      const { error: rpcError } = await supabase.rpc('join_household_by_code', {
        p_invite_code: inviteCode.trim().toUpperCase(),
        p_display_name: displayName.trim(),
        p_parent_label: parentLabel,
      });
      if (rpcError) throw new Error(errorMessage(rpcError));
      await refresh();
    },
  }), [loading, workspace, error, refresh]);

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('useWorkspace must be used inside WorkspaceProvider');
  return value;
}
