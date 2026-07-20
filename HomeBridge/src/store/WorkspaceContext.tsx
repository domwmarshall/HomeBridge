import React, { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { supabase } from '../lib/supabase';
import { HouseholdMember, Workspace } from '../types';

interface WorkspaceContextValue {
  loading: boolean;
  workspace: Workspace | null;
  error: string | null;
  refresh: () => Promise<void>;
  createHousehold: (input: { householdName: string; displayName: string; parentLabel: 'Dad' | 'Mum'; childName: string }) => Promise<void>;
  joinHousehold: (input: { inviteCode: string; displayName: string; parentLabel: 'Dad' | 'Mum' }) => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

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

      const [householdResult, childResult, membersResult] = await Promise.all([
        supabase.from('households').select('id, name').eq('id', membership.household_id).single(),
        supabase.from('children').select('id').eq('household_id', membership.household_id).order('created_at').limit(1).single(),
        supabase.from('household_members').select('user_id, display_name, parent_label, role').eq('household_id', membership.household_id).order('joined_at'),
      ]);
      if (householdResult.error) throw householdResult.error;
      if (childResult.error) throw childResult.error;
      if (membersResult.error) throw membersResult.error;

      const members: HouseholdMember[] = (membersResult.data ?? []).map((row: any) => ({
        userId: row.user_id,
        displayName: row.display_name,
        parentLabel: row.parent_label ?? undefined,
        role: row.role,
      }));

      const client = supabase;
      if (!client) throw new Error('Supabase is not configured.');
      const createInvite = async (parentLabel: string) => {
        const { data, error: inviteError } = await client.rpc('create_household_invite', {
          p_household_id: membership.household_id,
          p_parent_label: parentLabel,
        });
        if (inviteError) throw inviteError;
        const result = Array.isArray(data) ? data[0] : data;
        if (!result?.invite_code) throw new Error('No invite code was returned.');
        return String(result.invite_code);
      };

      setWorkspace({
        householdId: membership.household_id,
        householdName: householdResult.data.name,
        childId: childResult.data.id,
        userId: user.id,
        displayName: membership.display_name,
        parentLabel: membership.parent_label ?? undefined,
        members,
        createInvite,
        refreshWorkspace: refresh,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load the shared household.');
      setWorkspace(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

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
      if (rpcError) throw rpcError;
      await refresh();
    },
    joinHousehold: async ({ inviteCode, displayName, parentLabel }) => {
      if (!supabase) throw new Error('Supabase is not configured.');
      const { error: rpcError } = await supabase.rpc('join_household_by_code', {
        p_invite_code: inviteCode.trim().toUpperCase(),
        p_display_name: displayName.trim(),
        p_parent_label: parentLabel,
      });
      if (rpcError) throw rpcError;
      await refresh();
    },
  }), [loading, workspace, error, refresh]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('useWorkspace must be used inside WorkspaceProvider');
  return value;
}
