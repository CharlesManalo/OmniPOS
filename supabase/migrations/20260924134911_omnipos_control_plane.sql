-- All writes go through authenticated Edge Functions. No desktop contains service credentials.
create table public.omni_developers (
  user_id uuid primary key references auth.users(id), enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.omni_tenants (
  id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 2 and 120),
  email text not null, business_type text not null check(business_type in ('retail','grocery','cafe','restaurant')),
  plan text not null check(plan in ('starter','professional','enterprise','custom')),
  status text not null default 'active' check(status in ('active','disabled','deleted')),
  paid_until timestamptz not null, offline_hours integer not null default 24 check(offline_hours between 0 and 24),
  max_terminals integer not null default 1 check(max_terminals between 1 and 100),
  modules text[] not null default array['pos'] check(modules <@ array['pos','inventory','reports','gcash']::text[] and modules @> array['pos']::text[]),
  license_version integer not null default 1 check(license_version > 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.omni_members (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.omni_tenants(id),
  user_id uuid not null unique references auth.users(id), email text not null,
  role text not null check(role in ('owner','manager','cashier','auditor')), enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create index omni_members_tenant_idx on public.omni_members(tenant_id);
create table public.omni_devices (
  tenant_id uuid not null references public.omni_tenants(id), device_id uuid not null,
  enabled boolean not null default true, last_seen timestamptz not null default now(),
  primary key(tenant_id,device_id)
);
create table public.omni_audit (
  id uuid primary key default gen_random_uuid(), actor_id uuid not null references auth.users(id),
  tenant_id uuid references public.omni_tenants(id), action text not null, details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index omni_audit_tenant_time_idx on public.omni_audit(tenant_id,created_at desc);
create index omni_audit_actor_idx on public.omni_audit(actor_id);
create table public.omni_sales (
  tenant_id uuid not null references public.omni_tenants(id), id uuid not null,
  user_id uuid not null references auth.users(id), device_id uuid not null, total bigint not null check(total between 0 and 1000000000),
  sale jsonb not null, created_at timestamptz not null, received_at timestamptz not null default now(),
  primary key(tenant_id,id)
);
create index omni_sales_user_idx on public.omni_sales(user_id);
create index omni_sales_tenant_time_idx on public.omni_sales(tenant_id,created_at desc);

alter table public.omni_developers enable row level security;
alter table public.omni_tenants enable row level security;
alter table public.omni_members enable row level security;
alter table public.omni_devices enable row level security;
alter table public.omni_audit enable row level security;
alter table public.omni_sales enable row level security;
revoke all on public.omni_developers,public.omni_tenants,public.omni_members,public.omni_devices,public.omni_audit,public.omni_sales from anon,authenticated;
grant all on public.omni_developers,public.omni_tenants,public.omni_members,public.omni_devices,public.omni_audit,public.omni_sales to service_role;
grant select on public.omni_members,public.omni_tenants to authenticated;
create policy own_membership on public.omni_members for select to authenticated using (user_id=(select auth.uid()));
create policy own_tenant on public.omni_tenants for select to authenticated using (
  id in (select tenant_id from public.omni_members where user_id=(select auth.uid()) and enabled)
);

create function public.omni_admin_mutate(p_actor uuid,p_action text,p_data jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare t public.omni_tenants; target uuid; member public.omni_members; old_data jsonb;
begin
  if not exists(select 1 from public.omni_developers where user_id=p_actor and enabled) then
    raise exception 'Developer access required' using errcode='42501';
  end if;
  if p_action='admin.createTenant' then
    insert into public.omni_tenants(name,email,business_type,plan,paid_until,offline_hours,max_terminals,modules)
    values(p_data->'tenant'->>'name',p_data->'tenant'->>'email',p_data->'tenant'->>'business_type',p_data->'tenant'->>'plan',
      (p_data->'tenant'->>'paid_until')::timestamptz,(p_data->'tenant'->>'offline_hours')::integer,
      (p_data->'tenant'->>'max_terminals')::integer,array(select jsonb_array_elements_text(p_data->'tenant'->'modules')))
    returning * into t;
    insert into public.omni_members(tenant_id,user_id,email,role)
    values(t.id,(p_data->>'user_id')::uuid,p_data->'account'->>'email',p_data->'account'->>'role');
    target=t.id;
  elsif p_action='admin.updateTenant' then
    select * into strict t from public.omni_tenants where id=(p_data->>'id')::uuid for update;
    if t.status='deleted' then raise exception 'Restore the tenant before editing'; end if;
    old_data=to_jsonb(t);
    update public.omni_tenants set name=p_data->'tenant'->>'name',email=p_data->'tenant'->>'email',
      business_type=p_data->'tenant'->>'business_type',plan=p_data->'tenant'->>'plan',paid_until=(p_data->'tenant'->>'paid_until')::timestamptz,
      offline_hours=(p_data->'tenant'->>'offline_hours')::integer,max_terminals=(p_data->'tenant'->>'max_terminals')::integer,
      modules=array(select jsonb_array_elements_text(p_data->'tenant'->'modules')),license_version=license_version+1,updated_at=now()
    where id=t.id returning * into t;
    target=t.id;
  elsif p_action='admin.status' then
    select * into strict t from public.omni_tenants where id=(p_data->>'id')::uuid for update;
    if p_data->>'status'='deleted' and (p_data->>'confirmName') is distinct from t.name then raise exception 'Type the tenant name to delete'; end if;
    old_data=to_jsonb(t);
    update public.omni_tenants set status=p_data->>'status',license_version=license_version+1,updated_at=now() where id=t.id returning * into t;
    target=t.id;
  elsif p_action='admin.createUser' then
    select * into strict t from public.omni_tenants where id=(p_data->>'tenantId')::uuid for update;
    if t.status='deleted' then raise exception 'Restore tenant before adding users'; end if;
    insert into public.omni_members(tenant_id,user_id,email,role) values(t.id,(p_data->>'user_id')::uuid,p_data->'account'->>'email',p_data->'account'->>'role');
    target=t.id;
  elsif p_action='admin.updateUser' then
    select * into strict member from public.omni_members where id=(p_data->>'id')::uuid for update;
    old_data=to_jsonb(member);
    update public.omni_members set role=p_data->>'role',enabled=(p_data->>'enabled')::boolean where id=member.id;
    target=member.tenant_id;
    update public.omni_tenants set license_version=license_version+1,updated_at=now() where id=target;
  elsif p_action='admin.revokeDevice' then
    target=(p_data->>'tenantId')::uuid;
    perform 1 from public.omni_tenants where id=target for update;
    update public.omni_devices set enabled=false where tenant_id=target and device_id=(p_data->>'deviceId')::uuid;
    if not found then raise exception 'Terminal not found'; end if;
    update public.omni_tenants set license_version=license_version+1,updated_at=now() where id=target;
  else raise exception 'Unsupported administration action';
  end if;
  insert into public.omni_audit(actor_id,tenant_id,action,details)
    values(p_actor,target,p_action,jsonb_build_object('before',old_data,'request',(p_data - 'account' - 'user_id')));
  return jsonb_build_object('id',target);
end $$;
revoke all on function public.omni_admin_mutate(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.omni_admin_mutate(uuid,text,jsonb) to service_role;

create function public.omni_issue_context(p_user uuid,p_device uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare t public.omni_tenants; m public.omni_members; d public.omni_devices;
begin
  select * into m from public.omni_members where user_id=p_user and enabled;
  if not found then raise exception 'Client account is disabled or unavailable' using errcode='42501'; end if;
  select * into t from public.omni_tenants where id=m.tenant_id for update;
  if t.status<>'active' then raise exception 'Your subscription has been disabled. Contact your developer.' using errcode='42501'; end if;
  if t.paid_until<=now() then raise exception 'Subscription expired. Contact your developer to renew.' using errcode='42501'; end if;
  select * into d from public.omni_devices where tenant_id=t.id and device_id=p_device;
  if found then
    if not d.enabled then raise exception 'This terminal has been revoked' using errcode='42501'; end if;
    -- A reduced limit deterministically retains the most recently used terminals.
    if (select count(*) from public.omni_devices where tenant_id=t.id and enabled and (last_seen,device_id)>(d.last_seen,d.device_id))>=t.max_terminals then
      raise exception 'Terminal limit reduced. Contact your developer.' using errcode='42501';
    end if;
    update public.omni_devices set last_seen=now() where tenant_id=t.id and device_id=p_device;
  else
    if (select count(*) from public.omni_devices where tenant_id=t.id and enabled)>=t.max_terminals then
      raise exception 'Terminal limit reached. Ask your developer to increase the limit.' using errcode='42501';
    end if;
    insert into public.omni_devices(tenant_id,device_id) values(t.id,p_device);
  end if;
  return jsonb_build_object('tenant',to_jsonb(t),'member',to_jsonb(m),'server_time',extract(epoch from now())::bigint);
end $$;
revoke all on function public.omni_issue_context(uuid,uuid) from public,anon,authenticated;
grant execute on function public.omni_issue_context(uuid,uuid) to service_role;
