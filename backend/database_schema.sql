-- Enable the pgvector extension to work with image embeddings
create extension if not exists vector;

-- Create the products table
create table public.products (
    id uuid default gen_random_uuid() primary key,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    name text not null,
    box_number text not null,
    quantity integer default 0 not null,
    price numeric,
    basic_details text,
    image_url text,
    -- Store the AI visual fingerprint (Gemini outputs 768 dimensions for multimodal/text embeddings by default)
    -- If using gemini 'text-embedding-004' it's 768. 
    -- We will use 768 dimensions.
    embedding vector(768)

);

-- Set up Row Level Security (RLS)
-- For simplicity in our initial build, we will allow anonymous read and insert. 
-- IN PRODUCTION: You should restrict this to authenticated users.
alter table public.products enable row level security;

create policy "Enable read access for all users" on public.products
    for select using (true);

create policy "Enable insert for all users" on public.products
    for insert with check (true);

-- Create a storage bucket for our product pictures
insert into storage.buckets (id, name, public) 
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

create policy "Public Access to Images"
  on storage.objects for select
  using ( bucket_id = 'product-images' );

create policy "Public Insert to Images"
  on storage.objects for insert
  with check ( bucket_id = 'product-images' );

-- Create a helper function for vector similarity search
create or replace function match_products (
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  name text,
  box_number text,
  image_url text,
  similarity float
)
language sql stable
as $$
  select
    products.id,
    products.name,
    products.box_number,
    products.image_url,
    1 - (products.embedding <=> query_embedding) as similarity
  from products
  where 1 - (products.embedding <=> query_embedding) > match_threshold
  order by products.embedding <=> query_embedding
  limit match_count;
$$;

-- Create the users table for authentication
create table public.users (
    id uuid default gen_random_uuid() primary key,
    username text unique not null,
    password_hash text not null,
    role text not null default 'user'
);

-- Insert default admin (Password: admin123)
-- The password_hash is bcrypt for "admin123"
insert into public.users (username, password_hash, role)
values ('admin', '$2b$12$2tamwVwHLoi73xX/hY992OaqAzKA9Bxe7WbXC3etepD8UPY7vl8Im', 'admin');

-- Create the product_logs table for audit tracking
create table public.product_logs (
    id uuid default gen_random_uuid() primary key,
    product_id uuid references public.products(id) on delete cascade not null,
    action text not null,
    details text not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS for product_logs (allow read/insert for testing)
alter table public.product_logs enable row level security;
create policy "Enable read access for all users on logs" on public.product_logs
    for select using (true);
create policy "Enable insert for all users on logs" on public.product_logs
    for insert with check (true);
