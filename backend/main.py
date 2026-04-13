import os
import io
import uuid
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from supabase import create_client, Client
from google import genai
from google.genai import types
from PIL import Image

# Load .env from the backend folder, regardless of where uvicorn is launched
load_dotenv(Path(__file__).parent / ".env")

# Initialize Google Gemini Client (Modern SDK)
gemini_client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))


app = FastAPI(title="Stock Inventory Manager API")
print("\n" + "="*50)
print("BACKEND VERSION 2.0 (MODERN SDK) STARTING...")
print(f"API BASE CONFIG: {os.environ.get('SUPABASE_URL')}")
print("="*50 + "\n")



app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Since it's local Vite for now
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Supabase
supabase_url = os.environ.get("SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_KEY")
supabase: Client = create_client(supabase_url, supabase_key)


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
    image: UploadFile = File(...)
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
        vision_response = gemini_client.models.generate_content(
            model='gemini-flash-latest',
            contents=[prompt, img_pil]
        )
        detailed_description = vision_response.text
        print(f"Extracted description (first 50 chars): {detailed_description[:50]}...")

        
        # 3. Create a 3072-Dimension vector embedding from that highly precise description
        print("Generating embedding...")
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
        
        print("Product added successfully!")
        return {"success": True, "product": db_res.data[0]}
    
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
        vision_response = gemini_client.models.generate_content(
            model='gemini-flash-latest',
            contents=[prompt, img_pil]
        )

        description = vision_response.text
        
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
def update_stock(product_id: str, body: StockUpdate):
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
        
        print(f"Stock updated: {current_qty} -> {new_qty}")
        return {"success": True, "new_quantity": new_qty}
    
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"Error updating stock:\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":

    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
