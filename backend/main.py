import os
import io
import uuid
from pathlib import Path
import datetime
from typing import Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel
from dotenv import load_dotenv
from supabase import create_client, Client
from google import genai
from google.genai import types
from PIL import Image
import jwt
from passlib.context import CryptContext

# Load .env from the backend folder, regardless of where uvicorn is launched
load_dotenv(Path(__file__).parent / ".env")

# Initialize Google Gemini Client (Modern SDK)
gemini_client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

import time

# In-memory tracking of Gemini API calls to monitor rate limits
gemini_usage_timestamps = []

def track_gemini_call():
    global gemini_usage_timestamps
    current_time = time.time()
    gemini_usage_timestamps.append(current_time)
    # Clean up timestamps older than 60 seconds
    gemini_usage_timestamps = [t for t in gemini_usage_timestamps if current_time - t < 60]


app = FastAPI(title="Stock Inventory Manager API")
print("\n" + "="*50)
print("BACKEND VERSION 2.0 (MODERN SDK) STARTING...")
print(f"API BASE CONFIG: {os.environ.get('SUPABASE_URL')}")
print("="*50 + "\n")



app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Initialize Supabase
supabase_url = os.environ.get("SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_KEY")
supabase: Client = create_client(supabase_url, supabase_key)


# Auth Setup
SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "super-secret-default-key")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7 # 1 week

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/login")

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.datetime.utcnow() + datetime.timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_admin(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        role: str = payload.get("role")
        if role != "admin":
            raise HTTPException(status_code=403, detail="Not authorized (Admin only)")
        return payload
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

@app.post("/api/login")
def login(form_data: OAuth2PasswordRequestForm = Depends()):
    res = supabase.table("users").select("*").eq("username", form_data.username).execute()
    if not res.data:
        raise HTTPException(status_code=400, detail="Incorrect username or password")
    
    user = res.data[0]
    if not verify_password(form_data.password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Incorrect username or password")
        
    access_token = create_access_token(data={"sub": user["username"], "role": user["role"]})
    return {"access_token": access_token, "token_type": "bearer", "role": user["role"]}

@app.get("/")
def read_root():
    return {"status": "backend is running perfectly!"}

@app.get("/api/products")
def get_products():
    res = supabase.table("products").select("*").order("created_at", desc=True).execute()
    return {"products": res.data}

@app.post("/api/product")
async def add_product(
    name: str = Form(...),
    box_number: str = Form(...),
    quantity: int = Form(0),
    price: float = Form(0.0),
    basic_details: str = Form(""),
    image: UploadFile = File(...),
    admin: dict = Depends(get_current_admin)
):
    print(f"--- Adding Product: {name} ---")
    try:
        # Read incoming image 
        image_bytes = await image.read()
        print(f"Read {len(image_bytes)} bytes from image.")
        extension = image.filename.split(".")[-1]
        file_name = f"{uuid.uuid4()}.{extension}"
        
        # 1. Upload the image file to Supabase Object Storage
        print("Uploading image to Supabase Storage...")
        content_type = image.content_type if image.content_type else "image/jpeg"
        res = supabase.storage.from_("product-images").upload(
            path=file_name,
            file=image_bytes,
            file_options={"content-type": content_type}
        )
        # Check for error codes if any
        if hasattr(res, 'error') and res.error:
            print(f"Storage Upload Error Check: {res.error}")
        
        image_url = supabase.storage.from_("product-images").get_public_url(file_name)
        print(f"Image uploaded successfully. URL: {image_url}")
        
        # 2. Extract deep visual characteristics & OCR text via Gemini Vision
        print("Extracting features with Gemini Vision...")
        img_pil = Image.open(io.BytesIO(image_bytes))
        prompt = "Describe this product incredibly precisely. Read all text, buttons, tags on it and describe its physical characteristics and shape. What are the unique identifying markers?"
        track_gemini_call()
        vision_response = gemini_client.models.generate_content(
            model='gemini-flash-latest',
            contents=[prompt, img_pil]
        )
        detailed_description = vision_response.text
        print(f"Extracted description (first 50 chars): {detailed_description[:50]}...")

        
        # 3. Create a 768-Dimension vector embedding from that highly precise description

        print("Generating embedding...")
        track_gemini_call()
        embedding_result = gemini_client.models.embed_content(
            model="gemini-embedding-001", 
            contents=detailed_description,
            config=types.EmbedContentConfig(task_type="RETRIEVAL_DOCUMENT")
        )
        embedding_vector = embedding_result.embeddings[0].values
        print(f"Generated embedding vector of length: {len(embedding_vector)}")

        
        # 4. Insert data into our Postgres Database
        print("Inserting data into Supabase Products table...")
        insert_data = {
            "name": name,
            "box_number": box_number,
            "quantity": quantity,
            "price": price,
            "basic_details": detailed_description,
            "image_url": image_url,
            "embedding": embedding_vector
        }
        db_res = supabase.table("products").insert(insert_data).execute()
        new_product = db_res.data[0]
        
        # Insert log
        supabase.table("product_logs").insert({
            "product_id": new_product["id"],
            "action": "Created",
            "details": f"Product '{name}' added with quantity {quantity}"
        }).execute()
        
        print("Product added successfully!")
        return {"success": True, "product": new_product}
    
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"CRITICAL ERROR in add_product:\n{error_trace}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/search")
async def search_product(image: UploadFile = File(...)):
    try:
        image_bytes = await image.read()
        img_pil = Image.open(io.BytesIO(image_bytes))
        
        prompt = "Describe this product precisely. Read all text, buttons, tags on it and describe its physical characteristics."
        track_gemini_call()
        vision_response = gemini_client.models.generate_content(
            model='gemini-flash-latest',
            contents=[prompt, img_pil]
        )

        description = vision_response.text
        
        track_gemini_call()
        embedding_result = gemini_client.models.embed_content(
            model="gemini-embedding-001",
            contents=description,
            config=types.EmbedContentConfig(task_type="RETRIEVAL_QUERY")
        )
        query_vector = embedding_result.embeddings[0].values


        
        # Execute Supabase RPC function (Vector search algorithm match_products)
        rpc_res = supabase.rpc(
            "match_products",
            {
                "query_embedding": query_vector,
                "match_threshold": 0.60, # 60% similarity threshold
                "match_count": 5
            }
        ).execute()
        
        return {"results": rpc_res.data, "extracted_features": description}
    
    except Exception as e:
        print(f"Error searching product: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

class StockUpdate(BaseModel):
    increment: int

@app.patch("/api/product/{product_id}/stock")
def update_stock(product_id: str, body: StockUpdate, admin: dict = Depends(get_current_admin)):
    increment = body.increment
    print(f"--- Updating Stock for Product {product_id}: {increment:+d} ---")

    try:
        # 1. Get current quantity
        res = supabase.table("products").select("quantity").eq("id", product_id).single().execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Product not found")
        
        current_qty = res.data["quantity"]
        new_qty = current_qty + increment
        
        # Prevent negative stock
        if new_qty < 0:
            new_qty = 0
            
        # 2. Update database
        update_res = supabase.table("products").update({"quantity": new_qty}).eq("id", product_id).execute()
        
        # 3. Verify the update actually happened (RLS can silently block updates)
        if not update_res.data:
            raise HTTPException(
                status_code=403,
                detail="Update blocked by database security policy. Please add the UPDATE policy in Supabase: CREATE POLICY \"Enable update for all users\" ON public.products FOR UPDATE USING (true) WITH CHECK (true);"
            )
        
        # Insert log
        supabase.table("product_logs").insert({
            "product_id": product_id,
            "action": "Stock Adjust",
            "details": f"Quantity changed from {current_qty} to {new_qty} ({increment:+d})"
        }).execute()
        
        print(f"Stock updated: {current_qty} -> {new_qty}")
        return {"success": True, "new_quantity": new_qty}
    
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"Error updating stock:\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))


class ProductUpdate(BaseModel):
    name: str
    box_number: str
    price: float

@app.patch("/api/product/{product_id}")
async def update_product_details(
    product_id: str,
    name: str = Form(...),
    box_number: str = Form(...),
    price: float = Form(...),
    image: Optional[UploadFile] = File(None),
    admin: dict = Depends(get_current_admin)
):
    try:
        res = supabase.table("products").select("*").eq("id", product_id).single().execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Product not found")
        old_data = res.data
        
        update_data = {
            "name": name,
            "box_number": box_number,
            "price": price
        }
        
        # Handle image update if provided
        if image:
            print(f"--- Updating Image for Product {product_id} ---")
            image_bytes = await image.read()
            extension = image.filename.split(".")[-1]
            file_name = f"{uuid.uuid4()}.{extension}"
            
            # 1. Upload new image
            content_type = image.content_type if image.content_type else "image/jpeg"
            supabase.storage.from_("product-images").upload(
                path=file_name,
                file=image_bytes,
                file_options={"content-type": content_type}
            )
            image_url = supabase.storage.from_("product-images").get_public_url(file_name)
            update_data["image_url"] = image_url
            
            # 2. Re-extract features with Gemini Vision
            img_pil = Image.open(io.BytesIO(image_bytes))
            prompt = "Describe this product incredibly precisely. Read all text, buttons, tags on it and describe its physical characteristics and shape. What are the unique identifying markers?"
            track_gemini_call()
            vision_response = gemini_client.models.generate_content(
                model='gemini-flash-latest',
                contents=[prompt, img_pil]
            )
            detailed_description = vision_response.text
            update_data["basic_details"] = detailed_description
            
            # 3. Create new embedding
            track_gemini_call()
            embedding_result = gemini_client.models.embed_content(
                model="gemini-embedding-001",
                contents=detailed_description,
                config=types.EmbedContentConfig(task_type="RETRIEVAL_DOCUMENT")
            )
            update_data["embedding"] = embedding_result.embeddings[0].values
            print("Image and features updated successfully.")

        res = supabase.table("products").update(update_data).eq("id", product_id).execute()
        updated_product = res.data[0]
        
        changes = []
        if old_data["name"] != name: changes.append(f"Name '{old_data['name']}' -> '{name}'")
        if old_data["box_number"] != box_number: changes.append(f"Box '{old_data['box_number']}' -> '{box_number}'")
        if float(old_data["price"] or 0) != price: changes.append(f"Price '{old_data['price']}' -> '{price}'")
        if image: changes.append("Image updated")
        
        detail_msg = ", ".join(changes) if changes else "Saved without changes"
        
        supabase.table("product_logs").insert({
            "product_id": product_id,
            "action": "Edited Details",
            "details": detail_msg
        }).execute()
        
        return {"success": True, "product": updated_product}
    except Exception as e:
        import traceback
        print(f"Error updating product: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/product/{product_id}")
def delete_product(product_id: str, admin: dict = Depends(get_current_admin)):
    try:
        supabase.table("products").delete().eq("id", product_id).execute()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/product/{product_id}/logs")
def get_product_logs(product_id: str, admin: dict = Depends(get_current_admin)):
    res = supabase.table("product_logs").select("*").eq("product_id", product_id).order("created_at", desc=True).execute()
    return {"logs": res.data}

@app.get("/api/system/metrics")
def get_system_metrics():
    global gemini_usage_timestamps
    current_time = time.time()
    # Clean up and count valid timestamps
    gemini_usage_timestamps = [t for t in gemini_usage_timestamps if current_time - t < 60]
    return {
        "gemini_rpm_usage": len(gemini_usage_timestamps),
        "gemini_rpm_limit": 15
    }


class PasswordReset(BaseModel):
    new_password: str

@app.post("/api/admin/reset_password")
def reset_password(body: PasswordReset, admin: dict = Depends(get_current_admin)):
    try:
        new_hash = get_password_hash(body.new_password)
        # Update admin user password
        supabase.table("users").update({"password_hash": new_hash}).eq("username", admin["sub"]).execute()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":

    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
