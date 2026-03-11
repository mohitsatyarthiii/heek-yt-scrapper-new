export default function LogsPanel({logs}){

  return(

    <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 h-[350px] overflow-y-auto">

      {logs.map(log=>(
        <div key={log._id} className="text-sm text-green-400 mb-2">

          [{new Date(log.createdAt).toLocaleTimeString()}]

          <span className="ml-2 text-slate-300">
            {log.message}
          </span>

        </div>
      ))}

    </div>

  )

}