import { Link } from "react-router-dom"
import { Cpu } from "lucide-react"

export default function Navbar(){

  return(

    <div className="bg-slate-950 border-b border-slate-800 p-4 flex justify-between items-center">

      <div className="flex items-center gap-2 text-cyan-400 font-bold text-lg">
        <Cpu size={22}/>
        CRAWLER
      </div>

      <div className="flex gap-6 text-slate-300">

        <Link to="/">Control Center</Link>
        <Link to="/creators">Collected Creators</Link>

      </div>

    </div>

  )

}