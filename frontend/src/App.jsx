import { BrowserRouter, Routes, Route } from "react-router-dom"
import Dashboard from "./pages/Dashboard"
import Creators from "./pages/Creators"
import Navbar from "./components/Navbar"


function App(){

  return(

    <BrowserRouter>

      <Navbar/>

      <Routes>

        <Route path="/" element={<Dashboard/>}/>
        <Route path="/creators" element={<Creators/>}/>
  

      </Routes>

    </BrowserRouter>

  )

}

export default App