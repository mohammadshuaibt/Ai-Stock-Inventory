import { useState, useEffect, useRef } from 'react'

const API_BASE = import.meta.env.VITE_API_BASE || `http://${window.location.hostname}:8000/api`

function App() {
  const [view, setView] = useState('dashboard') // dashboard, add, search, search-results, detail, bulk-update, edit
  const [products, setProducts] = useState([])
  const [searchResults, setSearchResults] = useState([])
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [apiMetrics, setApiMetrics] = useState(null)
  
  // Auth State
  const [token, setToken] = useState(localStorage.getItem('token') || null)
  const [role, setRole] = useState(localStorage.getItem('role') || 'guest')
  const [showLogin, setShowLogin] = useState(false)
  const [showReset, setShowReset] = useState(false)

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const res = await fetch(`${API_BASE}/system/metrics`)
        if (res.ok) {
          const data = await res.json()
          setApiMetrics(data)
        }
      } catch (e) {
        console.error("Failed to fetch metrics", e)
      }
    }
    
    fetchMetrics()
    const interval = setInterval(fetchMetrics, 10000)
    return () => clearInterval(interval)
  }, [])

  const handleLogin = (t, r) => {
    localStorage.setItem('token', t)
    localStorage.setItem('role', r)
    setToken(t)
    setRole(r)
    setShowLogin(false)
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('role')
    setToken(null)
    setRole('guest')
    setView('dashboard')
  }

  const getHeaders = () => {
    return token ? { 'Authorization': `Bearer ${token}` } : {}
  }

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
      const timeout = setTimeout(() => controller.abort(), 8000) 

      const res = await fetch(`${API_BASE}/products`, { headers: getHeaders(), signal: controller.signal })
      clearTimeout(timeout)

      if (!res.ok) throw new Error(`Server responded with ${res.status}`)
      
      const data = await res.json()
      setProducts(data.products || [])
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }

  return (
    <div className="container">
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h1>Stock Manager</h1>
          <p className="subtitle">AI Powered Inventory</p>
          {apiMetrics && role === 'admin' && (
            <div style={{ marginTop: '8px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', color: '#94a3b8' }}>
              <span style={{ 
                display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', 
                background: apiMetrics.gemini_rpm_usage >= 10 ? 'var(--danger)' : apiMetrics.gemini_rpm_usage >= 5 ? '#eab308' : 'var(--success)'
              }}></span>
              AI Quota Usage (Live): {apiMetrics.gemini_rpm_usage} / {apiMetrics.gemini_rpm_limit} RPM
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
           {token && role === 'admin' && (
             <button className="btn btn-secondary" style={{width: 'auto', padding: '6px 14px', fontSize: '13px', background: '#0f172a'}} onClick={() => setShowReset(true)}>Change Password</button>
           )}
           {token ? (
             <button className="btn btn-secondary" style={{width: 'auto', padding: '6px 14px', fontSize: '13px'}} onClick={handleLogout}>Logout</button>
           ) : (
             <button className="btn btn-secondary" style={{width: 'auto', padding: '6px 14px', fontSize: '13px'}} onClick={() => setShowLogin(true)}>Admin Login</button>
           )}
        </div>
      </header>

      {showLogin && <LoginModal onClose={() => setShowLogin(false)} onSuccess={handleLogin} />}
      {showReset && <ResetPasswordModal onClose={() => setShowReset(false)} getHeaders={getHeaders} onSuccess={() => {setShowReset(false); alert('Password updated successfully!');}} />}

      {view === 'dashboard' && !showLogin && (
        <Dashboard
          products={products}
          loading={loading}
          error={error}
          role={role}
          onRetry={fetchProducts}
          onAdd={() => setView('add')}
          onSearch={() => setView('search')}
          onProductClick={(p) => {
            setSelectedProduct(p)
            setView('detail')
          }}
        />
      )}

      {view === 'add' && !showLogin && role === 'admin' && (
        <AddProduct onBack={() => setView('dashboard')} onSuccess={() => setView('dashboard')} getHeaders={getHeaders} />
      )}

      {view === 'detail' && selectedProduct && !showLogin && (
        <ProductDetail
          product={selectedProduct}
          role={role}
          getHeaders={getHeaders}
          onBack={() => setView('dashboard')}
          onRefresh={fetchProducts}
          onEdit={(p) => {
            setSelectedProduct(p)
            setView('edit')
          }}
          onDelete={() => {
            setView('dashboard')
            fetchProducts()
          }}
          onBulkUpdate={(p) => {
            setSelectedProduct(p)
            setView('bulk-update')
          }}
        />
      )}

      {view === 'edit' && selectedProduct && role === 'admin' && (
         <EditProduct 
            product={selectedProduct}
            getHeaders={getHeaders}
            onBack={() => setView('detail')}
            onSuccess={(updated) => {
                setSelectedProduct(updated)
                setView('detail')
                fetchProducts()
            }}
         />
      )}

      {view === 'bulk-update' && selectedProduct && role === 'admin' && (
        <BulkUpdate
          product={selectedProduct}
          getHeaders={getHeaders}
          onBack={() => setView('detail')}
          onSuccess={(newQty) => {
            setSelectedProduct(prev => ({ ...prev, quantity: newQty }))
            fetchProducts()
            setView('detail')
          }}
        />
      )}

      {view === 'search' && !showLogin && (
        <SearchProduct
          getHeaders={getHeaders}
          onBack={() => setView('dashboard')}
          onResults={(results) => {
            setSearchResults(results)
            setView('search-results')
          }}
        />
      )}

      {view === 'search-results' && !showLogin && (
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

function LoginModal({ onClose, onSuccess }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const formData = new URLSearchParams()
      formData.append('username', username)
      formData.append('password', password)

      const res = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData
      })
      if (!res.ok) throw new Error("Invalid username or password")
      const data = await res.json()
      onSuccess(data.access_token, data.role)
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  return (
    <div style={{ padding: '24px', background: '#1e293b', borderRadius: '16px', marginTop: '20px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)', border: '1px solid #334155' }}>
      <h2 style={{marginTop: 0, marginBottom: '20px', color: 'white'}}>Admin Login</h2>
      {error && <p style={{color: 'var(--danger)', marginBottom: '16px', fontSize: '14px', background: 'rgba(239, 68, 68, 0.1)', padding: '10px', borderRadius: '8px'}}>{error}</p>}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
           <label style={{display: 'block', marginBottom: '8px', color: '#94a3b8', fontSize: '14px'}}>Username</label>
           <input type="text" placeholder="Enter username" value={username} onChange={e => setUsername(e.target.value)} required style={{width: '100%'}} />
        </div>
        <div>
           <label style={{display: 'block', marginBottom: '8px', color: '#94a3b8', fontSize: '14px'}}>Password</label>
           <input type="password" placeholder="Enter password" value={password} onChange={e => setPassword(e.target.value)} required style={{width: '100%'}} />
        </div>
        <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} style={{flex: 1}}>Cancel</button>
          <button type="submit" className="btn" disabled={loading} style={{flex: 1}}>{loading ? "Verifying..." : "Login"}</button>
        </div>
      </form>
    </div>
  )
}

function Dashboard({ products, loading, error, role, onRetry, onAdd, onSearch, onProductClick }) {
  const [viewMode, setViewMode] = useState('kanban')
  const [searchQuery, setSearchQuery] = useState('')

  const filteredProducts = products.filter(p => 
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      p.box_number.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div>
      <div style={{ marginBottom: '16px', position: 'relative' }}>
        <span style={{position: 'absolute', left: '16px', top: '16px', color: '#94a3b8', display: 'flex', alignItems: 'center'}}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        </span>
        <input 
          type="text" 
          placeholder="Search product name or box..." 
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{ width: '100%', padding: '14px 16px 14px 44px', borderRadius: '12px', border: '1px solid #334155', background: '#0f172a', color: 'white', fontSize: '15px' }}
        />
      </div>

      {!loading && !error && products.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px', gap: '8px' }}>
          <button
            onClick={() => setViewMode('list')}
            style={{ padding: '6px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer', background: viewMode === 'list' ? 'var(--accent)' : '#334155', color: 'white', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
          >☰ List</button>
          <button
            onClick={() => setViewMode('kanban')}
            style={{ padding: '6px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer', background: viewMode === 'kanban' ? 'var(--accent)' : '#334155', color: 'white', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
          >⊞ Kanban</button>
        </div>
      )}

      {loading ? <div className="loading">Loading inventory...</div> : error ? (
        <div className="loading">
          <p>{error}</p>
          <button className="btn" onClick={onRetry}>Retry</button>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="loading">No products found fitting this criteria.</div>
      ) : viewMode === 'list' ? (
        filteredProducts.map(p => (
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
        <div className="kanban-grid">
          {filteredProducts.map(p => (
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
      )}

      {role === 'admin' ? (
        <div className="fab-container">
          <button className="fab secondary" onClick={onSearch} aria-label="Visual Search">
             <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          </button>
          <button className="fab" onClick={onAdd} aria-label="Add Product">+</button>
        </div>
      ) : (
        <div className="fab-container">
          <button className="fab" onClick={onSearch} aria-label="Visual Search">
             <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          </button>
        </div>
      )}
    </div>
  )
}

function ProductDetail({ product, role, getHeaders, onBack, onRefresh, onEdit, onDelete, onBulkUpdate }) {
  const [currentQty, setCurrentQty] = useState(product.quantity);
  const [updating, setUpdating] = useState(false);
  const [logs, setLogs] = useState([])

  useEffect(() => {
    fetchLogs()
  }, [])

  const fetchLogs = async () => {
     if (role !== 'admin') return;
     try {
       const res = await fetch(`${API_BASE}/product/${product.id}/logs`, { headers: getHeaders() })
       if (res.ok) {
          const data = await res.json()
          setLogs(data.logs || [])
       }
     } catch(e) {
       console.error("Failed to fetch logs")
     }
  }

  const adjustStock = async (increment) => {
    setUpdating(true);
    try {
      const res = await fetch(`${API_BASE}/product/${product.id}/stock`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getHeaders() },
        body: JSON.stringify({ increment })
      });
      const data = await res.json();
      if (data.success) {
        setCurrentQty(data.new_quantity);
        fetchLogs();
      } else {
        alert(`Failed: ${data.detail || 'Server error'}`);
      }
    } catch (e) {
      alert(`Network error: ${e.message}`);
    }
    setUpdating(false);
  }

  const handleDelete = async () => {
     if(window.confirm("Are you sure you want to completely delete this product? This action cannot be undone.")) {
        try {
           const res = await fetch(`${API_BASE}/product/${product.id}`, {
              method: 'DELETE',
              headers: getHeaders()
           })
           if(res.ok) onDelete()
           else alert("Failed to delete product.")
        } catch(e) {
           alert(e.message)
        }
     }
  }

  return (
    <div className="detail-view">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer' }}>← Back</button>
        {role === 'admin' && (
           <div style={{display: 'flex', gap: '8px'}}>
             <button onClick={() => onEdit(product)} className="btn btn-secondary" style={{width: 'auto', padding: '6px 14px', fontSize: '13px', background: '#334155'}}>Edit</button>
             <button onClick={handleDelete} className="btn btn-danger" style={{width: 'auto', padding: '6px 14px', fontSize: '13px'}}>Delete</button>
           </div>
        )}
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
            <div className="stat-value" style={{ color: currentQty > 0 ? 'var(--success)' : 'var(--danger)' }}>{currentQty} Units</div>
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

      {role === 'admin' && (
        <>
          <div style={{ marginBottom: '12px', fontSize: '14px', fontWeight: 'bold', marginTop: '24px' }}>Quick Adjust (+/- 1)</div>
          <div className="quick-stock-actions">
            <button disabled={updating} onClick={() => adjustStock(1)} className="stock-btn plus">Stock In (+1)</button>
            <button disabled={updating} onClick={() => adjustStock(-1)} className="stock-btn minus">Stock Out (-1)</button>
          </div>
          <button className="btn bulk-btn" onClick={() => onBulkUpdate({ ...product, quantity: currentQty })}>📦 Bulk Stock Update</button>
        </>
      )}

      {/* Audit Logs */}
      {role === 'admin' && (
      <div style={{ marginTop: '36px' }}>
         <h3 style={{ borderBottom: '1px solid #1e293b', paddingBottom: '12px', marginBottom: '16px', fontSize: '16px' }}>📝 Audit History</h3>
         {logs.length === 0 ? <p style={{color: '#475569', fontSize: '14px', fontStyle: 'italic'}}>No history logs available.</p> : (
            <div style={{display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '400px', overflowY: 'auto', paddingRight: '5px'}}>
               {logs.map(log => (
                  <div key={log.id} style={{ background: '#0f172a', padding: '14px', borderRadius: '10px', borderLeft: '4px solid var(--accent)'}}>
                     <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px', fontWeight: '500' }}>
                        {new Date(log.created_at).toLocaleString()}
                     </div>
                     <div style={{ fontWeight: '600', fontSize: '15px', marginBottom: '4px', color: 'white' }}>{log.action}</div>
                     <div style={{ fontSize: '14px', color: '#cbd5e1' }}>{log.details}</div>
                  </div>
               ))}
            </div>
         )}
      </div>
      )}

    </div>
  )
}

function EditProduct({ product, getHeaders, onBack, onSuccess }) {
  const [name, setName] = useState(product.name)
  const [box, setBox] = useState(product.box_number)
  const [price, setPrice] = useState(product.price)
  const [imageBlob, setImageBlob] = useState(null)
  const [imagePreview, setImagePreview] = useState(product.image_url)
  const [loading, setLoading] = useState(false)
  const [changeImage, setChangeImage] = useState(false)

  const handleCapture = (blob, previewUrl) => {
    setImageBlob(blob)
    setImagePreview(previewUrl)
    setChangeImage(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    
    const formData = new FormData()
    formData.append("name", name)
    formData.append("box_number", box)
    formData.append("price", price)
    if (imageBlob) {
      formData.append("image", imageBlob, "update.jpg")
    }

    try {
      const res = await fetch(`${API_BASE}/product/${product.id}`, {
        method: "PATCH",
        headers: getHeaders(), // Let browser set Content-Type for FormData
        body: formData
      })
      if(res.ok) {
        const data = await res.json()
        onSuccess(data.product)
      }
      else {
        const err = await res.json()
        alert("Update failed: " + (err.detail || "Unknown error"))
      }
    } catch(e) {
      alert("Network error: " + e.message)
    }
    setLoading(false)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '24px' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', marginRight: '10px' }}>← Cancel</button>
        <h2>Edit Details</h2>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <img src={imagePreview} className="captured-image" alt="Product" style={{ maxWidth: '200px', borderRadius: '12px', border: '2px solid #334155' }} />
          {!changeImage ? (
            <button type="button" className="btn btn-secondary" onClick={() => setChangeImage(true)} style={{ display: 'block', margin: '10px auto', width: 'auto' }}>
              Change Product Image
            </button>
          ) : (
            <div style={{ marginTop: '10px' }}>
              <ImageCapture onCapture={handleCapture} />
              <button type="button" className="btn btn-secondary" onClick={() => setChangeImage(false)} style={{ marginTop: '10px', background: 'none', border: 'none', color: '#94a3b8' }}>Cancel Image Change</button>
            </div>
          )}
        </div>

        <label>Product Name</label>
        <input required type="text" value={name} onChange={e => setName(e.target.value)} />

        <label>Box Number</label>
        <input required type="text" value={box} onChange={e => setBox(e.target.value)} />

        <label>Price</label>
        <input type="number" step="0.01" min="0" value={price} onChange={e => setPrice(e.target.value)} />

        <button className="btn" type="submit" disabled={loading} style={{marginTop: '20px'}}>
          {loading ? (imageBlob ? "AI Analyzing & Saving..." : "Saving Changes...") : "Save Changes"}
        </button>
      </form>
    </div>
  )
}

function AddProduct({ onBack, onSuccess, getHeaders }) {
  const [step, setStep] = useState(1) // 1: camera, 2: form
  const [imageBlob, setImageBlob] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [loading, setLoading] = useState(false)

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
        headers: getHeaders(), // DO NOT set Content-Type for FormData
        body: formData
      })
      if (res.ok) {
        onSuccess()
      } else {
        const errorData = await res.json().catch(() => ({}))
        alert(`Failed to add: ${res.status} - ${errorData.detail || "Server error"}`)
      }
    } catch (e) {
      alert(`Network error: ${e.message}`)
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

function SearchProduct({ getHeaders, onBack, onResults }) {
  const [loading, setLoading] = useState(false)

  const handleCapture = async (blob) => {
    setLoading(true)
    const formData = new FormData()
    formData.append("image", blob, "search.jpg")

    try {
      const res = await fetch(`${API_BASE}/search`, {
        method: "POST",
        headers: getHeaders(),
        body: formData
      })
      const data = await res.json()
      if (data.results) {
        onResults(data.results)
      } else {
        alert("Search failed")
      }
    } catch (e) {
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
          const isExact = simScore >= 90 

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

function BulkUpdate({ product, getHeaders, onBack, onSuccess }) {
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState("in"); 

  const handleUpdate = async () => {
    if (!amount || isNaN(amount)) return;
    setLoading(true);
    try {
      const increment = mode === "in" ? parseInt(amount) : -parseInt(amount);

      const res = await fetch(`${API_BASE}/product/${product.id}/stock`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getHeaders() },
        body: JSON.stringify({ increment })
      });

      if (res.ok) {
        const data = await res.json()
        onSuccess(data.new_quantity)
      } else {
        const errorData = await res.json().catch(() => ({}))
        alert(`Failed to update stock: ${errorData.detail || "Server error"}`)
      }
    } catch (e) {
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
          <button className={`btn ${mode === 'in' ? '' : 'btn-secondary'}`} style={{ width: 'auto', padding: '10px 20px' }} onClick={() => setMode('in')}>Stock In</button>
          <button className={`btn ${mode === 'out' ? 'btn-danger' : 'btn-secondary'}`} style={{ width: 'auto', padding: '10px 20px' }} onClick={() => setMode('out')}>Stock Out</button>
        </div>

        <input autoFocus className="qty-input-large" type="number" placeholder="0" value={amount} onChange={e => setAmount(e.target.value)} />

        <button className="btn" onClick={handleUpdate} disabled={loading}>
          {loading ? "Updating..." : `Confirm Stock ${mode === 'in' ? 'Addition' : 'Removal'}`}
        </button>
      </div>
    </div>
  )
}

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
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFileChange} />
      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />
      <button className="btn" onClick={() => cameraInputRef.current?.click()} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
        <span style={{ fontSize: '20px' }}>📷</span> Take a Photo
      </button>
      <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', color: 'white' }}>
        <span style={{ fontSize: '20px' }}>🖼️</span> Upload from Gallery
      </button>
    </div>
  )
}

function ResetPasswordModal({ onClose, onSuccess, getHeaders }) {
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/admin/reset_password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders() },
        body: JSON.stringify({ new_password: newPassword })
      })
      if (!res.ok) throw new Error("Failed to reset password")
      onSuccess()
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  return (
    <div style={{ padding: '24px', background: '#1e293b', borderRadius: '16px', marginTop: '20px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)', border: '1px solid #334155' }}>
      <h2 style={{marginTop: 0, marginBottom: '20px', color: 'white'}}>Reset Admin Password</h2>
      {error && <p style={{color: 'var(--danger)', marginBottom: '16px', fontSize: '14px', background: 'rgba(239, 68, 68, 0.1)', padding: '10px', borderRadius: '8px'}}>{error}</p>}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
           <label style={{display: 'block', marginBottom: '8px', color: '#94a3b8', fontSize: '14px'}}>New Password</label>
           <input type="password" placeholder="Enter new password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required style={{width: '100%'}} />
        </div>
        <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} style={{flex: 1}}>Cancel</button>
          <button type="submit" className="btn" disabled={loading} style={{flex: 1}}>{loading ? "Saving..." : "Update Password"}</button>
        </div>
      </form>
    </div>
  )
}

export default App
