export default function CreatorsTable({channels}){

  return(

    <table className="w-full border border-slate-800">

      <thead className="bg-slate-900">

        <tr>

          <th className="p-3 text-left">Channel</th>
          <th className="p-3">Subscribers</th>
          <th className="p-3">Country</th>
          <th className="p-3">Email</th>

        </tr>

      </thead>

      <tbody>

        {channels.map(c=>(
          <tr key={c.channelId} className="border-t border-slate-800">

            <td className="p-3">{c.title}</td>
            <td className="p-3 text-center">{c.subscribers}</td>
            <td className="p-3 text-center">{c.country}</td>
            <td className="p-3 text-cyan-400">{c.email}</td>

          </tr>
        ))}

      </tbody>

    </table>

  )

}