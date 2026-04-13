import { useState, useEffect, useRef } from 'react'

// Detect environment: use localhost for dev, or the production URL once hosted
const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:8000/api'
  : '/api' // This assumes the frontend will be configured to proxy or the backend will be on the same domain


function App() {
  const [view, setView] = useState('dashboard') // dashboard, add, search, search-results, detail, bulk-update
  const [products, setProducts] = useState([])
  const [searchResults, setSearchResults] = useState([])
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)


  // Fetch initial products
  useEffect(() => {
    if (view === 'dashboard') {
      fetchProducts()
    }
  }, [view])

  const fetchProducts = async () => {
    setLoading(true)
    setError(null)
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000) // 5 second timeout
      const res = await fetch(`${API_BASE}/products`, { signal: controller.signal })
      clearTimeout(timeout)
      const data = await res.json()
      if (data.products) setProducts(data.products)
    } catch (e) {
      console.error(e)
      setError('Could not connect to backend. Make sure the server is running.')
    }
    setLoading(false)
  }

  return (
    <div className="container">
      <header>
        <div>
          <h1>Stock Manager</h1>
          <p className="subtitle">AI Powered Inventory</p>
        </div>
      </header>

      {view === 'dashboard' && (
        <Dashboard
          products={products}
          loading={loading}
          error={error}
          onRetry={fetchProducts}
          onAdd={() => setView('add')}
          onSearch={() => setView('search')}
          onProductClick={(p) => {
            setSelectedProduct(p)
            setView('detail')
          }}
        />
      )}

      {view === 'detail' && selectedProduct && (
        <ProductDetail
          product={selectedProduct}
          onBack={() => setView('dashboard')}
          onBulkUpdate={(p) => {
            setSelectedProduct(p)
            setView('bulk-update')
          }}
          onRefresh={fetchProducts}
        />
      )}

      {view === 'bulk-update' && selectedProduct && (
        <BulkUpdate
          product={selectedProduct}
          onBack={() => setView('detail')}
          onSuccess={(newQty) => {
            // Update the selected product with new quantity and go back to detail
            setSelectedProduct(prev => ({ ...prev, quantity: newQty }))
            fetchProducts() // also refresh dashboard in background
            setView('detail')
          }}
        />
      )}



      {view === 'add' && (
        <AddProduct
          onBack={() => setView('dashboard')}
          onSuccess={() => setView('dashboard')}
        />
      )}

      {view === 'search' && (
        <SearchProduct
          onBack={() => setView('dashboard')}
          onResults={(results) => {
            setSearchResults(results)
            setView('search-results')
          }}
        />
      )}

      {view === 'search-results' && (
        <SearchResults
          results={searchResults}
          onBack={() => setView('dashboard')}
          onSearchAgain={() => setView('search')}
          onProductClick={(p) => {
            setSelectedProduct(p)
            setView('detail')
          }}
        />
      )}

    </div>
  )
}

function Dashboard({ products, loading, error, onRetry, onAdd, onSearch, onProductClick }) {
  const [viewMode, setViewMode] = useState('list') // 'list' or 'kanban'

  return (
    <div>
      {/* View Toggle */}
      {!loading && !error && products.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px', gap: '8px' }}>
          <button
            onClick={() => setViewMode('list')}
            style={{
              padding: '6px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer',
              background: viewMode === 'list' ? 'var(--accent)' : '#334155',
              color: 'white', fontSize: '13px', fontWeight: '600',
              display: 'flex', alignItems: 'center', gap: '6px'
            }}
          >
            ☰ List
          </button>
          <button
            onClick={() => setViewMode('kanban')}
            style={{
              padding: '6px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer',
              background: viewMode === 'kanban' ? 'var(--accent)' : '#334155',
              color: 'white', fontSize: '13px', fontWeight: '600',
              display: 'flex', alignItems: 'center', gap: '6px'
            }}
          >
            ⊞ Kanban
          </button>
        </div>
      )}

      {loading ? <div className="loading">Loading inventory...</div> : error ? (
        <div className="loading">
          <p style={{ marginBottom: '12px' }}>{error}</p>
          <button className="btn" onClick={onRetry} style={{ maxWidth: '200px', margin: '0 auto' }}>Retry</button>
        </div>
      ) : (
        products.length === 0 ? (
          <div className="loading">No products found. Start by adding one!</div>
        ) : viewMode === 'list' ? (
          // --- LIST VIEW ---
          products.map(p => (
            <div className="product-item" key={p.id} onClick={() => onProductClick(p)} style={{ cursor: 'pointer' }}>
              <img src={p.image_url} alt={p.name} className="product-image" />
              <div className="product-info" style={{ flex: 1 }}>
                <h3>{p.name}</h3>
                <div className="meta">Qty: {p.quantity} | ₹{p.price}</div>
                <div className="box-badge">Box: {p.box_number}</div>
              </div>
            </div>
          ))
        ) : (
          // --- KANBAN VIEW ---
          <div className="kanban-grid">
            {products.map(p => (
              <div className="kanban-card" key={p.id} onClick={() => onProductClick(p)}>
                <div className="kanban-img-wrap">
                  <img src={p.image_url} alt={p.name} className="kanban-img" />
                  <span className={`kanban-stock-badge ${p.quantity === 0 ? 'out' : p.quantity <= 3 ? 'low' : 'ok'}`}>
                    {p.quantity === 0 ? 'Out' : `${p.quantity}`}
                  </span>
                </div>
                <div className="kanban-body">
                  <div className="kanban-name">{p.name}</div>
                  <div className="kanban-meta">
                    <span className="kanban-box">#{p.box_number}</span>
                    <span className="kanban-price">₹{p.price}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}



      <div className="fab-container">
        <button className="fab secondary" onClick={onSearch} aria-label="Search">
          🔍
        </button>
        <button className="fab" onClick={onAdd} aria-label="Add Product">
          +
        </button>
      </div>
    </div>
  )
}

function AddProduct({ onBack, onSuccess }) {
  const [step, setStep] = useState(1) // 1: camera, 2: form
  const [imageBlob, setImageBlob] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [loading, setLoading] = useState(false)

  // Form State
  const [name, setName] = useState("")
  const [box, setBox] = useState("")
  const [qty, setQty] = useState("1")
  const [price, setPrice] = useState("0")

  const handleCapture = (blob, previewUrl) => {
    setImageBlob(blob)
    setImagePreview(previewUrl)
    setStep(2)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    const formData = new FormData()
    formData.append("name", name)
    formData.append("box_number", box)
    formData.append("quantity", qty)
    formData.append("price", price)
    formData.append("image", imageBlob, "product.jpg")

    try {
      const res = await fetch(`${API_BASE}/product`, {
        method: "POST",
        body: formData
      })
      if (res.ok) {
        onSuccess()
      } else {
        const errorData = await res.json().catch(() => ({}))
        const msg = errorData.detail || "Unknown server error"
        alert(`Failed to add product: ${res.status} - ${msg}`)
      }
    } catch (e) {
      console.error(e)
      alert(`Network error adding product: ${e.message}. Check if server is running at ${API_BASE}`)
    }

    setLoading(false)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', marginRight: '10px' }}>← Back</button>
        <h2>Add New Product</h2>
      </div>

      {step === 1 && <ImageCapture onCapture={handleCapture} />}

      {step === 2 && (
        <form onSubmit={handleSubmit}>
          <img src={imagePreview} className="captured-image" alt="Captured" />
          <button type="button" className="btn btn-secondary" onClick={() => setStep(1)} style={{ marginBottom: '20px' }}>Change Photo</button>

          <label>Product Name</label>
          <input required type="text" placeholder="e.g. Samsung Remote" value={name} onChange={e => setName(e.target.value)} />

          <label>Box Number</label>
          <input required type="text" placeholder="e.g. B-12" value={box} onChange={e => setBox(e.target.value)} />

          <div style={{ display: 'flex', gap: '16px' }}>
            <div style={{ flex: 1 }}>
              <label>Quantity</label>
              <input required type="number" min="0" value={qty} onChange={e => setQty(e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label>Price</label>
              <input type="number" step="0.01" min="0" value={price} onChange={e => setPrice(e.target.value)} />
            </div>
          </div>

          <button className="btn" type="submit" disabled={loading}>
            {loading ? "Analyzing Image & Saving..." : "Save Product"}
          </button>
        </form>
      )}
    </div>
  )
}

function SearchProduct({ onBack, onResults }) {
  const [loading, setLoading] = useState(false)

  const handleCapture = async (blob) => {
    setLoading(true)
    const formData = new FormData()
    formData.append("image", blob, "search.jpg")

    try {
      const res = await fetch(`${API_BASE}/search`, {
        method: "POST",
        body: formData
      })
      const data = await res.json()
      if (data.results) {
        onResults(data.results)
      } else {
        alert("Search failed")
      }
    } catch (e) {
      console.error(e)
      alert("Error searching database")
    }
    setLoading(false)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', marginRight: '10px' }}>← Back</button>
        <h2>AI Image Search</h2>
      </div>

      <p className="subtitle" style={{ marginBottom: '16px' }}>Snap a photo of the product to find exact matches or similar items across all boxes.</p>

      {loading ? (
        <div className="loading" style={{ marginTop: '40px' }}>
          <h3>Scanning...</h3>
          <p>Sending physical product constraints & text to Gemini AI.</p>
        </div>
      ) : (
        <ImageCapture onCapture={handleCapture} />
      )}
    </div>
  )
}

function SearchResults({ results, onBack, onSearchAgain, onProductClick }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', marginRight: '10px' }}>← Dashboard</button>
        <h2>Search Results</h2>
      </div>

      <button className="btn btn-secondary" onClick={onSearchAgain} style={{ marginBottom: '24px' }}>Scan Another Item</button>

      {results.length === 0 ? (
        <div className="loading">No visually similar products found.</div>
      ) : (
        results.map(p => {
          const simScore = Math.round(p.similarity * 100)
          const isExact = simScore >= 90 // Arbitrary threshold for exact match flag

          return (
            <div className="product-item" key={p.id} onClick={() => onProductClick(p)} style={{ cursor: 'pointer' }}>
              <img src={p.image_url} alt={p.name} className="product-image" />
              <div className="product-info" style={{ flex: 1 }}>
                <span className="similarity-badge" style={{ background: isExact ? 'var(--success)' : '#eab308' }}>
                  {simScore}% Match
                </span>
                <h3>{p.name}</h3>
                <div className="box-badge">Box: {p.box_number}</div>
              </div>
            </div>
          )

        })
      )}
    </div>
  )
}

function ProductDetail({ product, onBack, onBulkUpdate, onRefresh }) {
  const [currentQty, setCurrentQty] = useState(product.quantity);
  const [updating, setUpdating] = useState(false);

  const adjustStock = async (increment) => {
    setUpdating(true);
    try {
      const formData = new FormData();
      formData.append("increment", increment);
      const res = await fetch(`${API_BASE}/product/${product.id}/stock`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ increment })
      });

      const data = await res.json();
      if (data.success) {
        setCurrentQty(data.new_quantity);
        onRefresh(); // Refresh dashboard in background
      } else {
        const msg = data.detail || "Server error";
        alert(`Failed to adjust stock: ${res.status} - ${msg}`);
      }
    } catch (e) {
      console.error(e);
      alert(`Network error adjusting stock: ${e.message}`);
    }

    setUpdating(false);
  }

  return (
    <div className="detail-view">
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', marginRight: '10px' }}>← Back</button>
        <h2>Product Details</h2>
      </div>

      <div className="detail-image-container">
        <img src={product.image_url} alt={product.name} className="detail-image" />
      </div>

      <div className="detail-info">
        <h1 style={{ marginBottom: '8px' }}>{product.name}</h1>
        <div style={{ color: 'var(--text-muted)', marginBottom: '16px' }}>
          Visual characteristics stored in backend for AI search.
        </div>

        <div className="detail-stats">
          <div className="stat-item">
            <div className="stat-label">Stock Status</div>
            <div className="stat-value" style={{ color: currentQty > 0 ? 'var(--success)' : 'var(--danger)' }}>
              {currentQty} Units
            </div>
          </div>
          <div className="stat-item">
            <div className="stat-label">Box No</div>
            <div className="stat-value">{product.box_number}</div>
          </div>
          <div className="stat-item">
            <div className="stat-label">Price</div>
            <div className="stat-value">₹{product.price}</div>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: '12px', fontSize: '14px', fontWeight: 'bold' }}>Quick Adjust (+/- 1)</div>
      <div className="quick-stock-actions">
        <button disabled={updating} onClick={() => adjustStock(1)} className="stock-btn plus">
          Stock In (+1)
        </button>
        <button disabled={updating} onClick={() => adjustStock(-1)} className="stock-btn minus">
          Stock Out (-1)
        </button>
      </div>

      <button className="btn bulk-btn" onClick={() => onBulkUpdate({ ...product, quantity: currentQty })}>
        📦 Bulk Stock Update
      </button>
    </div>
  )
}

function BulkUpdate({ product, onBack, onSuccess }) {
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState("in"); // in or out

  const handleUpdate = async () => {
    if (!amount || isNaN(amount)) return;
    setLoading(true);
    try {
      const increment = mode === "in" ? parseInt(amount) : -parseInt(amount);

      const res = await fetch(`${API_BASE}/product/${product.id}/stock`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ increment })
      });

      if (res.ok) {
        const data = await res.json()
        onSuccess(data.new_quantity)

      } else {
        const errorData = await res.json().catch(() => ({}))
        const msg = errorData.detail || "Server error"
        alert(`Failed to update stock: ${res.status} - ${msg}`)
      }
    } catch (e) {
      console.error(e)
      alert(`Network error updating stock: ${e.message}`)
    }

    setLoading(false);
  }

  return (
    <div className="detail-view">
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', marginRight: '10px' }}>← Cancel</button>
        <h2>Bulk Update</h2>
      </div>

      <div className="card bulk-update-card">
        <h3>{product.name}</h3>
        <p style={{ color: 'var(--text-muted)' }}>Current Stock: {product.quantity}</p>

        <div style={{ display: 'flex', gap: '10px', marginTop: '20px', justifyContent: 'center' }}>
          <button 
            className={`btn ${mode === 'in' ? '' : 'btn-secondary'}`} 
            style={{ width: 'auto', padding: '10px 20px' }}
            onClick={() => setMode('in')}
          >Stock In</button>
          <button 
            className={`btn ${mode === 'out' ? 'btn-danger' : 'btn-secondary'}`} 
            style={{ width: 'auto', padding: '10px 20px' }}
            onClick={() => setMode('out')}
          >Stock Out</button>
        </div>

        <input 
          autoFocus
          className="qty-input-large" 
          type="number" 
          placeholder="0"
          value={amount}
          onChange={e => setAmount(e.target.value)}
        />
        
        <button className="btn" onClick={handleUpdate} disabled={loading}>
          {loading ? "Updating..." : `Confirm Stock ${mode === 'in' ? 'Addition' : 'Removal'}`}
        </button>
      </div>
    </div>
  )
}

// Reusable Image Capture Component
function ImageCapture({ onCapture }) {
  const fileInputRef = useRef(null)
  const cameraInputRef = useRef(null)

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const previewUrl = URL.createObjectURL(file)
    onCapture(file, previewUrl)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      <button className="btn" onClick={() => cameraInputRef.current?.click()} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
        <span style={{ fontSize: '20px' }}>📷</span> Take a Photo
      </button>
      
      <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', color: 'white' }}>
        <span style={{ fontSize: '20px' }}>🖼️</span> Upload from Gallery
      </button>
    </div>
  )
}



export default App

