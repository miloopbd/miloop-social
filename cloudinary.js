const CLOUDINARY_CLOUD_NAME = "d6jclttf";
const CLOUDINARY_UPLOAD_PRESET = "miloop_upload";
export async function uploadMedia(file) {
  if (!(file instanceof File)) throw new Error("Choose a file first.");
  const isImage=/^image\/(jpeg|png|webp|gif)$/i.test(file.type),isVideo=/^video\/(mp4|webm|quicktime)$/i.test(file.type);
  if(!isImage&&!isVideo)throw new Error("Use JPG, PNG, WebP, GIF, MP4, WebM or MOV.");
  const maxBytes=isImage?10*1024*1024:40*1024*1024;
  if(file.size>maxBytes)throw new Error(isImage?"Image must be 10 MB or smaller.":"Video must be 40 MB or smaller.");
  const resourceType=isVideo?"video":"image",form=new FormData();
  form.append("file",file);form.append("upload_preset",CLOUDINARY_UPLOAD_PRESET);form.append("folder","miloop");
  return new Promise((resolve,reject)=>{
    const xhr=new XMLHttpRequest();xhr.open("POST","https://api.cloudinary.com/v1_1/"+CLOUDINARY_CLOUD_NAME+"/"+resourceType+"/upload");
    xhr.onload=()=>{let data={};try{data=JSON.parse(xhr.responseText||"{}");}catch(_){}if(xhr.status>=200&&xhr.status<300&&data.secure_url)resolve({url:data.secure_url,type:resourceType,publicId:data.public_id||""});else reject(new Error(data.error?.message||"Cloudinary upload failed ("+xhr.status+")."));};
    xhr.onerror=()=>reject(new Error("Network error while uploading. Check your connection."));xhr.onabort=()=>reject(new Error("Upload cancelled."));xhr.send(form);
  });
}
export function mediaMarkup(post,className="miloop-media"){
  const items=Array.isArray(post?.mediaItems)&&post.mediaItems.length
    ?post.mediaItems
    :(post?.mediaUrl&&["image","video"].includes(post.mediaType)?[{url:post.mediaUrl,type:post.mediaType}]:[]);
  if(!items.length)return "";
  return items.map(item=>{
    if(!item?.url||!["image","video"].includes(item.type))return "";
    const url=String(item.url).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;");
    return item.type==="video"
      ?'<div class="'+className+'"><video src="'+url+'" controls playsinline preload="metadata"></video></div>'
      :'<div class="'+className+'"><img src="'+url+'" alt="MILOOP media" loading="lazy"></div>';
  }).join("");
}

export async function uploadChatFile(file) {
  if (!(file instanceof File)) throw new Error("Choose a file first.");
  const isAudio=/^audio\\/(webm|ogg|mpeg|mp4|wav|aac)$/i.test(file.type);
  const isDocument=/^(application\\/pdf|application\\/vnd\\.openxmlformats-officedocument\\.(wordprocessingml\\.document|spreadsheetml\\.sheet|presentationml\\.presentation)|text\\/plain)$/i.test(file.type);
  if(!isAudio&&!isDocument)throw new Error("Supported: voice notes, PDF, DOCX, XLSX, PPTX and TXT.");
  if(file.size>20*1024*1024)throw new Error("File must be 20 MB or smaller.");
  const resourceType=isAudio?"video":"raw",form=new FormData();
  form.append("file",file);form.append("upload_preset",CLOUDINARY_UPLOAD_PRESET);form.append("folder","miloop/chat-files");
  return new Promise((resolve,reject)=>{
    const xhr=new XMLHttpRequest();xhr.open("POST","https://api.cloudinary.com/v1_1/"+CLOUDINARY_CLOUD_NAME+"/"+resourceType+"/upload");
    xhr.onload=()=>{let data={};try{data=JSON.parse(xhr.responseText||"{}");}catch(_){}if(xhr.status>=200&&xhr.status<300&&data.secure_url)resolve({url:data.secure_url,type:isAudio?"audio":"document",publicId:data.public_id||"",name:file.name,mime:file.type,size:file.size});else reject(new Error(data.error?.message||"File upload failed ("+xhr.status+")."));};
    xhr.onerror=()=>reject(new Error("Network error while uploading."));
    xhr.send(form);
  });
}
