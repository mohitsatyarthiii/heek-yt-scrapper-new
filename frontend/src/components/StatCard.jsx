export default function StatCard({title,value,sub}){

  return(

    <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">

      <p className="text-slate-400 text-sm">
        {title}
      </p>

      <h2 className="text-3xl font-bold text-cyan-400 mt-2">
        {value}
      </h2>

      <p className="text-xs text-slate-500 mt-1">
        {sub}
      </p>

    </div>

  )

}