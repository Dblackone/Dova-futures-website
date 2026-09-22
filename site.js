"use strict";
const projects = typeof PROJECTS === "undefined" ? [] : PROJECTS;
const aliases = typeof PROJECT_ALIASES === "undefined" ? {} : PROJECT_ALIASES;
const pages = ["home", "about", "services", "projects", "process", "why", "contact"];
const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[c]);
const originalTitle = 'DOVA FUTURES LIMITED | Design-build construction in Nigeria';
const originalDescription = 'Integrated architecture, construction and premium interior finishing across Nigeria.';
const originalImage = typeof IMAGE_MANIFEST !== 'undefined' ? IMAGE_MANIFEST['assets/optimized/hero-hillside.webp'].src : '/assets/optimized/hero-hillside.webp';
document.querySelectorAll('.server-project').forEach(item=>item.remove());
const projectUrl = id => "/?project=" + encodeURIComponent(id);
const pageUrl = page => page === "home" ? "/" : "/?page=" + page;
const plainClick = event => event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey;
function projectImage(path, alt, eager = false) {
  const versions = typeof IMAGE_MANIFEST === "undefined" ? null : IMAGE_MANIFEST[path];
  const src = versions ? versions.src : path;
  return '<img src="' + escapeHtml(src) + '" alt="' + escapeHtml(alt) + '" loading="' + (eager ? "eager" : "lazy") + '" decoding="async"' +
    (versions ? ' width="' + versions.width + '" height="' + versions.height + '" srcset="' + escapeHtml(versions.srcset) + '" sizes="(max-width: 600px) 100vw, (max-width: 1000px) 50vw, 640px"' : "") + " />";
}
function projectCard(project) {
  return '<a class="project-card project-item" data-category="' + escapeHtml(project.category) + '" data-project="' + escapeHtml(project.id) + '" href="' + projectUrl(project.id) + '" aria-label="View ' + escapeHtml(project.title) + '">' +
    projectImage(project.coverImage, project.title) + '<span class="project-card-copy"><span class="tag">' + escapeHtml(project.category) +
    (project.featured ? " · Featured" : "") + '</span><h3>' + escapeHtml(project.title) + '</h3><p>' + escapeHtml(project.location) + '</p></span></a>';
}
document.querySelectorAll('[id$="-footer"]').forEach(target => target.append(document.getElementById("footerTemplate").content.cloneNode(true)));
function closeMenu(returnFocus = false) {
  const menu = document.getElementById("mobileMenu");
  menu.hidden = true; menu.inert = true; menu.classList.remove("active");
  document.querySelector(".menu-trigger").setAttribute("aria-expanded", "false");
  if (returnFocus) document.querySelector(".menu-trigger").focus();
}
function toggleMobileMenu() {
  const menu = document.getElementById("mobileMenu");
  if (!menu.hidden) return closeMenu(true);
  menu.hidden = false; menu.inert = false; menu.classList.add("active");
  document.querySelector(".menu-trigger").setAttribute("aria-expanded", "true");
  menu.querySelector("a").focus();
}
function setMetadata(title, description, url, image = originalImage) {
  document.title = title;
  document.querySelector('meta[name="description"]').content = description;
  document.querySelector('link[rel="canonical"]').href = new URL(url, 'https://dovafutures.com');
  for (const [key, value] of Object.entries({title, description, url:new URL(url, 'https://dovafutures.com').href, image:new URL(image, 'https://dovafutures.com').href})) {
    document.querySelector('meta[property="og:' + key + '"]').content = value;
  }
}
function navigateTo(page, updateUrl = true, focus = true) {
  if (!pages.includes(page)) page = "home";
  closeMenu();
  document.querySelectorAll(".page").forEach(item => item.classList.toggle("active", item.id === "page-" + page));
  document.querySelectorAll(".nav-link").forEach(item => {
    const active = item.dataset.page === page;
    item.classList.toggle("active-page", active);
    if (active) item.setAttribute("aria-current", "page"); else item.removeAttribute("aria-current");
  });
  const detail = document.getElementById("projectDetail");
  if (detail) detail.hidden = true;
  document.getElementById("projectsGrid").hidden = false;
  document.querySelector(".filters").hidden = false;
  if (updateUrl) history.pushState({}, "", pageUrl(page));
  setMetadata(page === "home" ? originalTitle : page.charAt(0).toUpperCase() + page.slice(1) + " | Dova Futures", originalDescription, pageUrl(page));
  if (focus) {
    const heading = document.querySelector("#page-" + page + " h1, #page-" + page + " h2");
    if (heading) { heading.tabIndex = -1; heading.focus({preventScroll:true}); }
  }
  window.scrollTo({top:0, behavior:"instant"});
}
function openProject(id, updateUrl = true, focus = true) {
  id = aliases[id] || id;
  const project = projects.find(p => p.id === id);
  navigateTo("projects", false, false);
  let detail = document.getElementById("projectDetail");
  if (!detail) {
    detail = document.createElement("article");
    detail.id = "projectDetail"; detail.className = "project-detail";
    document.getElementById("projectsGrid").after(detail);
  }
  document.getElementById("projectsGrid").hidden = true;
  document.querySelector(".filters").hidden = true;
  detail.hidden = false;
  const back = '<a class="button cream detail-back" data-navigate="projects" href="/?page=projects">← All projects</a>';
  if (!project) {
    detail.innerHTML = back + '<div class="project-detail-copy"><h2>Project not found</h2><p>This project link is unavailable. Please browse our current portfolio.</p></div>';
    setMetadata("Project not found | Dova Futures", "Browse the current Dova Futures project portfolio.", "/?page=projects");
  } else {
    detail.innerHTML = back + '<div class="project-detail-media">' + projectImage(project.coverImage, project.title, true) + '</div><div class="project-detail-copy">' +
      '<span class="eyebrow clay">' + escapeHtml(project.category + " · " + project.location) + '</span><h2>' + escapeHtml(project.title) + '</h2><p>' + escapeHtml(project.summary) +
      '</p><dl class="project-meta">' + [["Delivery",project.deliveryType],["Status",project.status],["Services",project.services.join(", ")],["Location",project.location]].map(([k,v]) => '<div><dt>'+k+'</dt><dd>'+escapeHtml(v)+'</dd></div>').join("") +
      '</dl><h3>Scope of work</h3><ul class="project-scope">' + project.scope.map(s => "<li>"+escapeHtml(s)+"</li>").join("") + '</ul><a class="button cream" href="/?page=contact" data-navigate="contact">Start a project ↗</a></div>' +
      '<div class="project-gallery">' + project.gallery.map((img,i) => '<figure>'+projectImage(img, project.title+" — "+(project.captions?.[i] || "project image "+(i+1)))+'<figcaption>'+escapeHtml(project.captions?.[i] || "Project image "+(i+1))+'</figcaption></figure>').join("") + '</div>' +
      '<div class="related-projects"><h3>More projects</h3><div class="projects-grid">' + projects.filter(p=>p.id!==id).sort((a,b)=>Number(b.category===project.category)-Number(a.category===project.category)).slice(0,3).map(projectCard).join("") + '</div></div>';
    setMetadata(project.title+" | Dova Futures", project.summary, projectUrl(id), typeof IMAGE_MANIFEST !== 'undefined' ? IMAGE_MANIFEST[project.coverImage].src : project.coverImage);
  }
  if (updateUrl) history.pushState({}, "", projectUrl(id));
  else if (project && new URLSearchParams(location.search).get("project") !== id) history.replaceState({}, "", projectUrl(id));
  if (focus) { const heading=detail.querySelector("h2"); heading.tabIndex=-1; heading.focus({preventScroll:true}); }
  detail.scrollIntoView({behavior:"instant",block:"start"});
}
function restoreRoute(focus = true) {
  const params = new URLSearchParams(location.search);
  if (params.has("project")) openProject(params.get("project"), false, focus);
  else navigateTo(params.get("page") || "home", false, focus);
}
document.addEventListener("click", event => {
  if (!plainClick(event)) return;
  const link = event.target.closest("[data-navigate], [data-project], [data-menu-toggle]");
  if (!link) return;
  event.preventDefault();
  if (link.hasAttribute("data-menu-toggle")) toggleMobileMenu();
  else if (link.dataset.project) openProject(link.dataset.project);
  else navigateTo(link.dataset.navigate);
});
document.addEventListener("keydown", event => {
  const menu = document.getElementById("mobileMenu");
  if (menu.hidden) return;
  if (event.key === "Escape") { event.preventDefault(); closeMenu(true); }
  if (event.key === "Tab") {
    const links=[...menu.querySelectorAll("a,button")];
    if (event.shiftKey && document.activeElement===links[0]) { event.preventDefault(); links.at(-1).focus(); }
    else if (!event.shiftKey && document.activeElement===links.at(-1)) { event.preventDefault(); links[0].focus(); }
  }
});
matchMedia("(min-width: 1001px)").addEventListener("change", e=>{if(e.matches)closeMenu();});
window.addEventListener("popstate", () => restoreRoute());
document.querySelectorAll(".project-filter").forEach(button => {
  button.setAttribute("aria-pressed", String(button.classList.contains("active")));
  button.addEventListener("click", () => {
    document.querySelectorAll(".project-filter").forEach(item => {
      item.classList.toggle("active", item===button); item.setAttribute("aria-pressed", String(item===button));
    });
    document.querySelectorAll("#projectsGrid .project-item").forEach(item => {item.hidden = button.dataset.filter !== "all" && item.dataset.category !== button.dataset.filter;});
  });
});
// Contact handlers initialize independently of optional catalogue/media data.
const form = document.getElementById("contactForm");
let submission = null;
function setFormStatus(message, type="success") {
  const status=document.getElementById("formStatus");
  status.textContent=message; status.className="form-status "+type;
}
function getContactFormData() { return Object.fromEntries([...new FormData(form)].map(([k,v])=>[k,String(v).trim()])); }
form.addEventListener("submit", async event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const payload=getContactFormData(), serialized=JSON.stringify(payload);
  if (!submission || submission.body!==serialized) submission={body:serialized,id:crypto.randomUUID()};
  const button=document.getElementById("sendEmailButton");
  if(button.disabled)return;
  button.disabled=true;button.setAttribute("aria-busy","true");button.textContent="Sending…";
  const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),15000);
  try {
    const response=await fetch("/api/contact",{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":submission.id},body:serialized,signal:controller.signal});
    const result=await response.json();
    if (!response.ok || !result.success) throw new Error(result.message || "Unable to submit your enquiry. Please try again or use WhatsApp.");
    setFormStatus(result.message || "Thank you. Your enquiry has been received.");
    form.reset(); submission=null;
  } catch(error) {
    setFormStatus(error.name==="AbortError" ? "The request timed out. Your details are still here; please retry or use WhatsApp." : error instanceof TypeError ? "Connection unavailable. Your details are still here; please retry or use WhatsApp." : error.message,"error");
  } finally {
    clearTimeout(timer);button.disabled=false;button.removeAttribute("aria-busy");button.innerHTML='Send email <span aria-hidden="true">↗</span>';
  }
});
document.getElementById("sendWhatsAppButton").addEventListener("click",()=>{
  if(!form.reportValidity())return;
  const p=getContactFormData();
  window.open("https://wa.me/2348163675439?text="+encodeURIComponent("Hello Dova Futures,\nMy name is "+p.firstName+" "+p.lastName+".\nProject: "+p.projectType+"\n"+p.message),"_blank","noopener,noreferrer");
});
document.getElementById("projectsGrid").innerHTML = projects.length ? projects.map(projectCard).join("") : "<p>Project information is temporarily unavailable. Please try again later or contact us.</p>";
const featured=document.querySelector(".project-lead");
featured.innerHTML=projects.filter(p=>p.featured).slice(0,3).map(projectCard).join("");
restoreRoute(false);
