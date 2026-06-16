const search = () =>{
    const searchbox = document.getElementById("search-question").value.toUpperCase();
    const questionlist = document.getElementById("question-list")
    const question = document.querySelectorAll(".Question")
    const qname = document.getElementsByTagName("h3")

    for(var i=0; i<qname.length; i++){
        let match = question[i].getElementsByTagName('h3')[0];

        if(match){
            let textvalue = match.textContent || match.innerHTML

            if(textvalue.toUpperCase().indexOf(searchbox) > -1){
                question[i].style.display = "";
            }else{
                question[i].style.display = "none";

            }
        }
    }
}